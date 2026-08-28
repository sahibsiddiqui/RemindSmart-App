# RemindSmart 🔔
### AI-Powered Smart Reminder App

> Speak, type, or photograph. RemindSmart uses AI to figure out your reminders so you don't have to.

Built for the things people actually forget: 
irregular medicine schedules, flight check-ins booked weeks ago, monthly payments, birthday wishes. 
Not a habit tracker. Not a basic calendar. Something smarter.

---

## Demo

[https://github.com/user-attachments/assets/94892902-54bb-401f-8451-85066cc1295a](https://github.com/user-attachments/assets/424e8820-fda7-4ec6-82db-57d030b3a1ba)

<img width="500" alt="image" src="https://github.com/user-attachments/assets/28f3b27e-4729-49c3-adb9-c51a69e5ca45" />

App sends notification for the respective reminder as well

---

## The Problem

Most reminder apps handle daily routines well. But there's a gap for **low-frequency, high-stakes events** ie. things that are days or weeks away, happen irregularly, and carry real consequences when forgotten.

- "Blood test after 3 days, then 7, then 21" — no app handles this well
- Flight booked 6 weeks ago — you forget to check in
- House help salary on the 1st — slips your mind every other month

RemindSmart solves this by letting you just *describe the situation* and letting AI figure out the rest.

---

## How It Works

```
User speaks / types / photographs
        ↓
Voice → transcribed via Gemini multimodal audio
Image → parsed via Gemini vision
        ↓
POST /api/parse → Express backend
        ↓
Gemini 2.5 Flash extracts: title, datetime, recurrence, note
Returns structured JSON array (handles multi-date series)
        ↓
Saved to Firebase Firestore
        ↓
Local push notifications scheduled via expo-notifications
```

---

## Features

- **Voice input** — speak naturally, Gemini transcribes + understands
- **Text input** — type your reminder in plain language
- **Image/prescription scan** — photograph a doctor's note, app extracts all dates
- **AI reminder engine** — handles irregular patterns like "3 days, 7 days, 21 days"
- **Smart notifications** — context-aware alerts, not generic pings
- **Recurrence support** — daily, weekly, monthly
- **Full CRUD** — view, edit, delete reminders with notification lifecycle management
- **Skeleton loading** — animated placeholders while fetching
- **Swipe to delete** — gesture handling via PanResponder

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile Frontend | React Native, Expo SDK 54 |
| Navigation | React Navigation (Native Stack) |
| Backend | Node.js, Express |
| Database | Firebase Firestore |
| AI / NLP | Google Gemini 3.5 Flash |
| Voice | expo-av + Gemini multimodal audio |
| Image Input | expo-image-picker |
| Notifications | expo-notifications |
| HTTP Client | Axios |

---

## Project Structure

```
RemindSmart/
├── app/                          # React Native frontend
│   ├── screens/
│   │   ├── HomeScreen.js         # Voice, text, image input
│   │   ├── ConfirmScreen.js      # Review & edit AI output before saving
│   │   ├── RemindersListScreen.js # All reminders, swipe-to-delete
│   │   └── EditReminderScreen.js  # Edit existing reminders
│   ├── App.js                    # Navigation container
│   └── app.json
│
└── server/                       # Node.js + Express backend
    ├── server.js                 # All routes + Firebase + Gemini integration
    └── .env                      # API keys (not committed)
```

---

## Backend API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/parse` | Send text/audio/image → get structured reminders from Gemini |
| POST | `/api/reminders` | Save a reminder to Firestore |
| GET | `/api/reminders` | Fetch all reminders (sorted by datetime) |
| PUT | `/api/reminders/:id` | Update a reminder |
| DELETE | `/api/reminders/:id` | Delete a reminder |

---

## Getting Started

### Prerequisites
- Node.js v18+
- Expo CLI (`npm install -g expo`)
- Expo Go app on your phone
- Firebase project with Firestore enabled
- Google Gemini API key (free tier — [get one here](https://aistudio.google.com))

### 1. Clone the repo
```bash
git clone https://github.com/sahibsiddiqui/RemindSmart-App.git
cd RemindSmart-App
```

### 2. Set up the backend
```bash
cd server
npm install
```

Create a `.env` file in `/server`:
```env
GEMINI_API_KEY=your_gemini_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="your_private_key"
```

Start the backend:
```bash
node server.js
# Running on http://localhost:3000
```

### 3. Set up the frontend
```bash
cd ../app
npm install
```

Update the API base URL in the app to point to your backend (local IP, not localhost, for physical device):
```js
// e.g. http://192.168.1.5:3000
const API_BASE = 'http://YOUR_LOCAL_IP:3000'
```
[To find your local ip, open windows terminal or cmd and type in "ipconfig", over there the network address shown for ipv4 address is your local ip.]

Start the app:
```bash
npx expo start
```

Scan the QR code with Expo Go on your phone.

---

## Notable Engineering Decisions

**Voice without a custom build:**
`@react-native-voice/voice` doesn't work with Expo Go out of the box. Instead of ejecting to a custom dev build, I used `expo-av` to record audio and sent it directly to Gemini's multimodal API for transcription, achieving the same result with zero native build overhead.

**Date-aware AI prompts:**
Gemini would sometimes infer the wrong year for relative dates ("after 3 days"). Fixed by injecting today's date dynamically into the system prompt so the model always has accurate temporal context.

**Notification lifecycle:**
Every reminder stores its `expo-notifications` ID in Firestore. On edit or delete, the old notification is cancelled before a new one is scheduled so no ghost notifications.

---

## What's Next (v2 Ideas)

- [ ] User auth + cloud sync across devices
- [ ] WhatsApp / email forwarding as input
- [ ] Flight booking detection —> auto-set check-in reminder
- [ ] Calendar export (`.ics`)
- [ ] Widget for home screen

---

## License

MIT
