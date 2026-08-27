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

// Config
const API_BASE = 'http://10.21.170.164:3000';

// Notification trigger builder (mirrors ConfirmScreen)
function buildNotificationTrigger(isoDatetime, recurrence) {
  const d      = new Date(isoDatetime);
  const hour   = d.getHours();
  const minute = d.getMinutes();

  if (recurrence === 'daily') {
    return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute };
  }
  if (recurrence === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: d.getDay() + 1,
      hour,
      minute,
    };
  }
  if (recurrence === 'monthly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 30 * 24 * 60 * 60,
      repeats: true,
    };
  }
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d };
}

// Recurrence options
const RECURRENCE_OPTIONS = [
  { value: 'none',    label: 'None'    },
  { value: 'daily',  label: 'Daily'   },
  { value: 'weekly', label: 'Weekly'  },
  { value: 'monthly',label: 'Monthly' },
];

// Date / time helpers (same as ConfirmScreen)
function isoToDateStr(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  } catch { return ''; }
}

function isoToTimeStr(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}

function buildIso(dateStr, timeStr) {
  try {
    const [yyyy, mm, dd]   = (dateStr || '').split('-').map(Number);
    const [hh = 0, min = 0] = (timeStr || '').split(':').map(Number);
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0);
    if (isNaN(d.getTime())) throw new Error('invalid date');
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// SegmentedControl
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

export default function EditReminderScreen({ route, navigation }) {
  const original = route?.params?.reminder ?? {};

  // Local editable state
  const [title,      setTitle]      = useState(original.title      ?? '');
  const [dateStr,    setDateStr]    = useState(isoToDateStr(original.datetime));
  const [timeStr,    setTimeStr]    = useState(isoToTimeStr(original.datetime));
  const [recurrence, setRecurrence] = useState(original.recurrence ?? 'none');
  const [note,       setNote]       = useState(original.note        ?? '');
  const [saving,     setSaving]     = useState(false);

  // Save flow
  async function handleSaveChanges() {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a title for this reminder.');
      return;
    }

    setSaving(true);
    const isoDatetime = buildIso(dateStr, timeStr);
    const apiRecurrence = recurrence === 'none' ? null : recurrence;

    try {
      // Step 1: PUT updated fields
      await axios.put(`${API_BASE}/api/reminders/${original.id}`, {
        title:          title.trim(),
        datetime:       isoDatetime,
        recurrence:     apiRecurrence,
        note:           note,
        notificationId: original.notificationId ?? '',
      });

      // Step 2: Cancel old notification
      if (original.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(
          original.notificationId
        ).catch(() => {});
      }

      // Step 3: Schedule new notification
      let newNotifId = '';
      try {
        const triggerDate = new Date(isoDatetime);
        const isRecurring = apiRecurrence !== null;
        if (isRecurring || triggerDate > new Date()) {
          newNotifId = await Notifications.scheduleNotificationAsync({
            content: {
              title: title.trim(),
              body:  note || title.trim(),
              sound: true,
            },
            trigger: buildNotificationTrigger(isoDatetime, apiRecurrence),
          });
        } else {
          console.log('[EditReminder] Skipping one-time notification — date is in the past.');
        }
      } catch (notifErr) {
        console.warn('[EditReminder] Notification scheduling failed:', notifErr.message);
        // Non-fatal — continue without notification
      }

      // Step 4: PUT new notificationId
      if (newNotifId) {
        await axios.put(`${API_BASE}/api/reminders/${original.id}`, {
          title:          title.trim(),
          datetime:       isoDatetime,
          recurrence:     apiRecurrence,
          note:           note,
          notificationId: newNotifId,
        }).catch((err) => {
          // Non-fatal — reminder is updated, just notificationId not synced
          console.warn('[EditReminder] PUT notificationId failed:', err.message);
        });
      }

      // Step 5: Navigate back
      navigation.navigate('RemindersList');

    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Save failed.';
      Alert.alert('Error', msg, [{ text: 'OK' }]);
    } finally {
      setSaving(false);
    }
  }

  // Rendering
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={s.label}>TITLE</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Reminder title"
          placeholderTextColor="#aaa"
        />

        {/* Date & Time */}
        <View style={s.row}>
          <View style={s.halfWrap}>
            <Text style={s.label}>DATE</Text>
            <TextInput
              style={s.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </View>
          <View style={[s.halfWrap, { marginLeft: 12 }]}>
            <Text style={s.label}>TIME (24h)</Text>
            <TextInput
              style={s.input}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="HH:MM"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Recurrence */}
        <Text style={s.label}>RECURRENCE</Text>
        <SegmentedControl value={recurrence} onChange={setRecurrence} />

        {/* Note */}
        <Text style={s.label}>NOTIFICATION MESSAGE</Text>
        <TextInput
          style={[s.input, s.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Short message shown in the notification"
          placeholderTextColor="#aaa"
          multiline
          textAlignVertical="top"
        />

        {/* Cancel link */}
        <TouchableOpacity
          style={s.cancelLink}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={s.cancelText}>Cancel — go back without saving</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View style={s.footer}>
        {saving ? (
          <View style={s.savingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={s.savingText}>Saving changes…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.saveBtn}
            onPress={handleSaveChanges}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={s.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Styles
const PURPLE = '#6c63ff';
const DARK   = '#1a1a2e';

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#f7f7fb',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:        24,
  },

  // ── Form fields ──
  label: {
    fontSize:      10,
    fontWeight:    '700',
    color:         PURPLE,
    letterSpacing: 1,
    marginBottom:  4,
    marginTop:     18,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth:       1,
    borderColor:       '#e0dff5',
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:          15,
    color:             DARK,
    backgroundColor:   '#fff',
  },
  noteInput: {
    minHeight:  80,
    paddingTop: 12,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'flex-start',
  },
  halfWrap: {
    flex: 1,
  },

  // ── Cancel link ──
  cancelLink: {
    marginTop:     28,
    alignItems:    'center',
  },
  cancelText: {
    fontSize:  13,
    color:     '#aaa',
    textDecorationLine: 'underline',
  },

  // ── Footer ──
  footer: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    backgroundColor:   '#fff',
    paddingHorizontal: 20,
    paddingVertical:   14,
    paddingBottom:     28,
    borderTopWidth:    1,
    borderTopColor:    '#eee',
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: -2 },
    shadowOpacity:     0.05,
    shadowRadius:      6,
    elevation:         8,
  },
  saveBtn: {
    backgroundColor: PURPLE,
    borderRadius:    14,
    paddingVertical: 15,
    alignItems:      'center',
  },
  saveBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   16,
  },
  savingRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: PURPLE,
    borderRadius:    14,
    paddingVertical: 15,
    gap:             10,
  },
  savingText: {
    color:      '#fff',
    fontWeight: '600',
    fontSize:   15,
  },
});

// ── SegmentedControl styles ──
const seg = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius:  10,
    borderWidth:   1,
    borderColor:   '#e0dff5',
    overflow:      'hidden',
    backgroundColor: '#fff',
  },
  segment: {
    flex:            1,
    paddingVertical: 10,
    alignItems:      'center',
    backgroundColor: '#fff',
  },
  segmentActive: {
    backgroundColor: PURPLE,
  },
  label: {
    fontSize:   12,
    fontWeight: '600',
    color:      '#777',
  },
  labelActive: {
    color: '#fff',
  },
});
