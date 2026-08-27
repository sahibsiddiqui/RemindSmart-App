import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Config — must match HomeScreen
// ---------------------------------------------------------------------------
const API_BASE = 'http://10.21.170.164:3000'; // ← your LAN IP

// ---------------------------------------------------------------------------
// Notification trigger builder
// Returns the correct trigger for one-time vs recurring reminders.
// DAILY and WEEKLY triggers fire at the NEXT occurrence, so they work even
// if the initial date is in the past.
// ---------------------------------------------------------------------------
function buildNotificationTrigger(isoDatetime, recurrence) {
  const d      = new Date(isoDatetime);
  const hour   = d.getHours();
  const minute = d.getMinutes();

  if (recurrence === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    };
  }
  if (recurrence === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: d.getDay() + 1, // expo: 1=Sunday … 7=Saturday
      hour,
      minute,
    };
  }
  if (recurrence === 'monthly') {
    // No native monthly trigger — approximate with a 30-day repeating interval.
    // Fires 30 days after each previous notification.
    return {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 30 * 24 * 60 * 60,
      repeats: true,
    };
  }
  // One-time: fire at the exact date
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: d,
  };
}

// ---------------------------------------------------------------------------
// Recurrence options
// ---------------------------------------------------------------------------
const RECURRENCE_OPTIONS = [
  { value: 'none',    label: 'None'    },
  { value: 'daily',  label: 'Daily'   },
  { value: 'weekly', label: 'Weekly'  },
  { value: 'monthly',label: 'Monthly' },
];

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

/** "2026-08-12T09:00:00.000Z" → "2026-08-12" (local date) */
function isoToDateStr(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

/** "2026-08-12T09:00:00.000Z" → "14:30" (local 24-h time) */
function isoToTimeStr(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hh  = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
  } catch {
    return '';
  }
}

/**
 * "2026-08-12" + "14:30" → ISO 8601 string in local time.
 * Returns current time ISO if parsing fails.
 */
function buildIso(dateStr, timeStr) {
  try {
    const [yyyy, mm, dd] = (dateStr || '').split('-').map(Number);
    const parts           = (timeStr || '').split(':').map(Number);
    const hh              = parts[0] ?? 0;
    const min             = parts[1] ?? 0;
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0);
    if (isNaN(d.getTime())) throw new Error('bad date');
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// SegmentedControl — recurrence selector
// ---------------------------------------------------------------------------
function SegmentedControl({ value, onChange }) {
  return (
    <View style={seg.container}>
      {RECURRENCE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[seg.segment, active && seg.segmentActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[seg.label, active && seg.labelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ReminderCard — one editable card per reminder
// ---------------------------------------------------------------------------
function ReminderCard({ reminder, index, onChange }) {
  // Check if the current date+time is in the past
  const isPast = (() => {
    try {
      return buildIso(reminder.dateStr, reminder.timeStr) < new Date().toISOString();
    } catch { return false; }
  })();

  return (
    <View style={card.container}>
      {/* Card header */}
      <View style={card.header}>
        <View style={card.badge}>
          <Text style={card.badgeText}>#{index + 1}</Text>
        </View>
        <Text style={card.headerLabel}>Reminder</Text>
      </View>

      {/* Past datetime warning */}
      {isPast && (
        <View style={card.pastWarning}>
          <Text style={card.pastWarningText}>
            ⚠️ This reminder is in the past — are you sure?
          </Text>
        </View>
      )}

      {/* Title */}
      <Text style={s.label}>TITLE</Text>
      <TextInput
        style={s.input}
        value={reminder.title}
        onChangeText={(v) => onChange('title', v)}
        placeholder="Reminder title"
        placeholderTextColor="#aaa"
      />

      {/* Date & Time — two adjacent fields */}
      <View style={s.row}>
        <View style={s.halfWrap}>
          <Text style={s.label}>DATE</Text>
          <TextInput
            style={s.input}
            value={reminder.dateStr}
            onChangeText={(v) => onChange('dateStr', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
          />
        </View>
        <View style={[s.halfWrap, { marginLeft: 12 }]}>
          <Text style={s.label}>TIME (24h)</Text>
          <TextInput
            style={s.input}
            value={reminder.timeStr}
            onChangeText={(v) => onChange('timeStr', v)}
            placeholder="HH:MM"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Recurrence */}
      <Text style={s.label}>RECURRENCE</Text>
      <SegmentedControl
        value={reminder.recurrence}
        onChange={(v) => onChange('recurrence', v)}
      />

      {/* Note */}
      <Text style={s.label}>NOTIFICATION MESSAGE</Text>
      <TextInput
        style={[s.input, s.noteInput]}
        value={reminder.note}
        onChangeText={(v) => onChange('note', v)}
        placeholder="Short message shown in the notification"
        placeholderTextColor="#aaa"
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

// ===========================================================================
// ConfirmScreen
// ===========================================================================
export default function ConfirmScreen({ route, navigation }) {
  const incoming = route?.params?.reminders ?? [];

  // ── Editable state ──────────────────────────────────────────────────────
  const [reminders, setReminders] = useState(
    incoming.map((r, i) => ({
      _key:       i,
      title:      r.title      ?? '',
      dateStr:    isoToDateStr(r.datetime),
      timeStr:    isoToTimeStr(r.datetime),
      recurrence: r.recurrence ?? 'none',
      note:       r.note       ?? '',
    }))
  );

  const [saving, setSaving] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────
  function updateField(index, field, value) {
    setReminders((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  // ── Save flow ────────────────────────────────────────────────────────────
  async function handleSaveAll() {
    if (reminders.length === 0) {
      Alert.alert('Nothing to save', 'There are no reminders to save.');
      return;
    }

    setSaving(true);

    try {
      for (let i = 0; i < reminders.length; i++) {
        const r          = reminders[i];
        const isoDatetime = buildIso(r.dateStr, r.timeStr);
        const recurrence  = r.recurrence === 'none' ? null : r.recurrence;

        // ── Step 1: POST reminder to Firestore ──────────────────────────
        let savedId;
        try {
          const postRes = await axios.post(`${API_BASE}/api/reminders`, {
            title:          r.title,
            datetime:       isoDatetime,
            recurrence:     recurrence,
            note:           r.note,
            notificationId: '',
          });
          savedId = postRes.data?.id;
        } catch (err) {
          const msg = err?.response?.data?.error ?? err?.message ?? 'Unknown error';
          Alert.alert(
            `Failed to save "${r.title}"`,
            msg,
            [{ text: 'OK' }]
          );
          setSaving(false);
          return; // stop — keep user on screen to retry
        }

        // ── Step 2: Schedule local push notification ────────────────────────
        let notifId = '';
        try {
          const triggerDate = new Date(isoDatetime);
          const now         = new Date();
          const isRecurring = recurrence !== null; // daily/weekly/monthly

          // Recurring triggers (DAILY/WEEKLY) fire at the NEXT occurrence —
          // schedule them regardless of whether the initial date is in the past.
          // One-time triggers must be in the future.
          if (isRecurring || triggerDate > now) {
            notifId = await Notifications.scheduleNotificationAsync({
              content: {
                title: r.title,
                body:  r.note || r.title,
                sound: true,
              },
              trigger: buildNotificationTrigger(isoDatetime, recurrence),
            });
          } else {
            console.log(
              `[ConfirmScreen] Skipping one-time notification for "${r.title}" — date is in the past.`
            );
          }
        } catch (notifErr) {
          // Non-fatal: notification scheduling may fail in Expo Go without
          // proper notification setup. Reminder is still saved to Firestore.
          console.warn(
            `[ConfirmScreen] Notification scheduling failed for "${r.title}":`,
            notifErr.message
          );
        }

        // ── Step 3: PUT notificationId back to Firestore ────────────────
        if (savedId && notifId) {
          try {
            await axios.put(`${API_BASE}/api/reminders/${savedId}`, {
              title:          r.title,
              datetime:       isoDatetime,
              recurrence:     recurrence,
              note:           r.note,
              notificationId: notifId,
            });
          } catch (putErr) {
            // Non-fatal: reminder is saved, just notification ID not synced.
            console.warn(
              `[ConfirmScreen] PUT notificationId failed for ${savedId}:`,
              putErr.message
            );
          }
        }
      } // end for-loop

      // ── All saved ───────────────────────────────────────────────────────
      Alert.alert(
        '✅ Saved!',
        `${reminders.length} reminder${reminders.length > 1 ? 's' : ''} scheduled successfully.`,
        [
          {
            text: 'View All',
            onPress: () => navigation.reset({
              index: 1,
              routes: [{ name: 'Home' }, { name: 'RemindersList' }],
            }),
          },
        ]
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page header */}
        <Text style={s.pageTitle}>Review your reminders</Text>
        <Text style={s.pageSubtitle}>
          Edit any details before saving.
        </Text>

        {/* Empty state */}
        {reminders.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🗒</Text>
            <Text style={s.emptyText}>No reminders were extracted.</Text>
            <Text style={s.emptyHint}>Go back and try a different input.</Text>
          </View>
        )}

        {/* Reminder cards */}
        {reminders.map((r, index) => (
          <ReminderCard
            key={r._key}
            reminder={r}
            index={index}
            onChange={(field, value) => updateField(index, field, value)}
          />
        ))}

        {/* Bottom spacer so cards aren't hidden behind the footer */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={s.footer}>
        {saving ? (
          <View style={s.savingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={s.savingText}>Saving reminders…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.saveBtn, reminders.length === 0 && s.saveBtnDisabled]}
            onPress={handleSaveAll}
            disabled={reminders.length === 0 || saving}
            activeOpacity={0.8}
          >
            <Text style={s.saveBtnText}>
              Save All{reminders.length > 0 ? ` (${reminders.length})` : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const PURPLE = '#6c63ff';
const DARK   = '#1a1a2e';
const CARD_BG = '#ffffff';
const BG     = '#f7f7fb';

// ── Shared / page styles ──
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DARK,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
  },

  // ── Form fields ──
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: PURPLE,
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0dff5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: DARK,
    backgroundColor: '#fafafa',
  },
  noteInput: {
    minHeight: 70,
    paddingTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  halfWrap: {
    flex: 1,
  },

  // ── Empty state ──
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: DARK,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: '#888',
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  saveBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 15,
    gap: 10,
  },
  savingText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});

// ── Card styles ──
const card = StyleSheet.create({
  container: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pastWarning: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ffd97d',
  },
  pastWarningText: {
    fontSize: 12,
    color: '#856404',
    fontWeight: '600',
  },
});

// ── Segmented control styles ──
const seg = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0dff5',
    overflow: 'hidden',
    marginTop: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  segmentActive: {
    backgroundColor: PURPLE,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  labelActive: {
    color: '#fff',
  },
});
