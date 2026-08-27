require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

// Firebase Admin initialisation
// The private key stored in .env uses literal "\n" — replace with real newlines
// so the PEM is valid before passing it to the SDK.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// Express setup
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Constants
const REMINDERS_COL = 'reminders';

// Gemini system prompt — generated per-request so it includes today's date.
// This prevents Gemini from picking a past year when the user omits the year.
function getGeminiSystemPrompt() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  return (
    `You are a reminder extraction engine. Today's date is ${todayStr} and the ` +
    `current year is ${year}. Given a natural language description of an event or ` +
    `task, return ONLY a valid JSON array of reminder objects. Each object must have: ` +
    `title (string), datetime (ISO 8601 string — ALWAYS use the year ${year} unless ` +
    `the user explicitly provides a different year; NEVER use a past year), ` +
    `recurrence (null | 'daily' | 'weekly' | 'monthly'), note (short contextual ` +
    `string shown in the push notification, max 10 words). For recurring reminders ` +
    `with no start date, use today (${todayStr}) as the start date. Return multiple ` +
    `objects for multi-date or series events. No explanation, no markdown, no code ` +
    `fences — just raw JSON array.`
  );
}

// Helper: strip markdown / code fences Gemini sometimes adds despite the prompt
function extractJSON(raw) {
  // Remove ```json ... ``` or ``` ... ``` wrappers if present
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(stripped);
}

// ROUTES:-
// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// POST /api/parse
// Accepts { text } OR { audio (base64), mimeType } and returns reminder array.
// When audio is provided Gemini transcribes + extracts in one multimodal call.
app.post('/api/parse', async (req, res) => {
  try {
    const { text, audio, mimeType } = req.body;

    if (!text && !audio) {
      return res.status(400).json({
        error: 'Request body must include "text" or "audio".',
      });
    }

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` +
      `?key=${process.env.GEMINI_API_KEY}`;

    // Build the user parts for the multimodal request
    let userParts;
    if (audio) {
      // Voice path: send audio inline so Gemini transcribes + extracts at once
      userParts = [
        {
          text: 'Listen to this voice recording and extract all reminder-relevant information as specified.',
        },
        {
          inlineData: {
            mimeType: mimeType || 'audio/m4a',
            data: audio,
          },
        },
      ];
    } else {
      // Text path (existing behaviour)
      userParts = [{ text: text.trim() }];
    }

    const payload = {
      system_instruction: {
        parts: [{ text: getGeminiSystemPrompt() }],
      },
      contents: [
        {
          role: 'user',
          parts: userParts,
        },
      ],
    };

    const geminiRes = await axios.post(geminiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      maxBodyLength: 50 * 1024 * 1024, // allow up to 50 MB body (audio)
    });

    // Gemini response structure: candidates[0].content.parts[0].text
    const rawText =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let reminders;
    try {
      reminders = extractJSON(rawText);
    } catch {
      console.error('[/api/parse] JSON parse failed. Raw response:', rawText);
      return res.status(400).json({
        error: 'AI returned malformed response. Please try again.',
      });
    }

    return res.status(200).json({ reminders });
  } catch (err) {
    console.error('[/api/parse]', err.response?.data ?? err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST /api/reminders
// Save a single confirmed reminder to Firestore.
app.post('/api/reminders', async (req, res) => {
  try {
    const { title, datetime, recurrence, note, notificationId } = req.body;

    const reminderData = {
      title: title ?? '',
      datetime: datetime ?? new Date().toISOString(),
      recurrence: recurrence ?? null,
      note: note ?? '',
      notificationId: notificationId ?? '',
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection(REMINDERS_COL).add(reminderData);

    return res.status(201).json({ id: docRef.id, ...reminderData });
  } catch (err) {
    console.error('[POST /api/reminders]', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET /api/reminders
// Fetch all reminders sorted by datetime ascending.
app.get('/api/reminders', async (_req, res) => {
  try {
    const snapshot = await db
      .collection(REMINDERS_COL)
      .orderBy('datetime', 'asc')
      .get();

    const reminders = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({ reminders });
  } catch (err) {
    console.error('[GET /api/reminders]', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// PUT /api/reminders/:id
// Update a reminder document.
app.put('/api/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, datetime, recurrence, note, notificationId } = req.body;

    const updatedData = {
      title: title ?? '',
      datetime: datetime ?? new Date().toISOString(),
      recurrence: recurrence ?? null,
      note: note ?? '',
      notificationId: notificationId ?? '',
    };

    const docRef = db.collection(REMINDERS_COL).doc(id);
    await docRef.update(updatedData);

    return res.status(200).json({ id, ...updatedData });
  } catch (err) {
    console.error('[PUT /api/reminders/:id]', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// DELETE /api/reminders/:id
// Hard-delete a reminder document.
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(REMINDERS_COL).doc(id).delete();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/reminders/:id]', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RemindSmart server running on port ${PORT}`);
});

module.exports = { app, db };
