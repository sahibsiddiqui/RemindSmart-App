import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = 'http://10.21.170.164:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PURPLE = '#6c63ff';
const DARK   = '#1a1a2e';

/** "2026-08-12T09:00:00.000Z" → "Tue, 12 Aug · 2:30 PM" */
function formatDatetime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString('en-US', {
      weekday: 'short',
      day:     'numeric',
      month:   'short',
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} · ${timePart}`;
  } catch {
    return iso;
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// SwipeableCard — swipe left to reveal delete button
// ---------------------------------------------------------------------------
const DELETE_W = 80;

// ---------------------------------------------------------------------------
// Skeleton loading — shown while fetching on first mount
// ---------------------------------------------------------------------------
function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={[sk.bar, { width: '68%', height: 17, marginBottom: 10 }]} />
      <View style={[sk.bar, { width: '48%', height: 12, marginBottom: 8  }]} />
      <View style={[sk.bar, { width: '82%', height: 11               }]} />
    </Animated.View>
  );
}

function SkeletonList() {
  return (
    <View style={sk.container}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

function SwipeableCard({ reminder, onDelete, onPress }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef  = useRef(false);
  const startXRef  = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only capture clear horizontal swipes
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        startXRef.current = isOpenRef.current ? -DELETE_W : 0;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(0, Math.max(-DELETE_W, startXRef.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const current = Math.min(0, Math.max(-DELETE_W, startXRef.current + g.dx));
        const open    = current < -(DELETE_W * 0.4);
        Animated.spring(translateX, {
          toValue:       open ? -DELETE_W : 0,
          useNativeDriver: true,
          tension:       120,
          friction:      9,
        }).start();
        isOpenRef.current = open;
      },
    })
  ).current;

  function snapClosed() {
    Animated.spring(translateX, {
      toValue:       0,
      useNativeDriver: true,
      tension:       120,
      friction:      9,
    }).start();
    isOpenRef.current = false;
  }

  function handleTap() {
    if (isOpenRef.current) {
      snapClosed();
    } else {
      onPress();
    }
  }

  return (
    <View style={sw.row}>
      {/* ── Delete button — lives behind the card ── */}
      <TouchableOpacity style={sw.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
        <Text style={sw.deleteBtnIcon}>🗑️</Text>
        <Text style={sw.deleteBtnText}>Delete</Text>
      </TouchableOpacity>

      {/* ── Animated card — slides left to reveal delete ── */}
      <Animated.View
        style={[sw.cardAnim, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={sw.card} onPress={handleTap} activeOpacity={0.7}>
          {/* Top row: title + recurrence badge */}
          <View style={sw.cardTop}>
            <Text style={sw.cardTitle} numberOfLines={1}>{reminder.title}</Text>
            {!!reminder.recurrence && (
              <View style={sw.badge}>
                <Text style={sw.badgeText}>{capitalize(reminder.recurrence)}</Text>
              </View>
            )}
          </View>

          {/* Datetime */}
          <Text style={sw.cardDateTime}>{formatDatetime(reminder.datetime)}</Text>

          {/* Note */}
          {!!reminder.note && (
            <Text style={sw.cardNote} numberOfLines={2}>{reminder.note}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ===========================================================================
// RemindersListScreen
// ===========================================================================
export default function RemindersListScreen({ navigation }) {
  const [reminders,    setReminders]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const [notifGranted, setNotifGranted] = useState(true); // assume granted until checked
  const mountedRef = useRef(false);

  // Check notification permission once on mount
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setNotifGranted(status === 'granted'))
      .catch(() => {});
  }, []);

  // ── Fetch ───────────────────────────────────────────────────────────
  // Extracted so it can be called from both useFocusEffect and onRefresh.
  const loadReminders = useCallback(async (showSpinner = false) => {
    setError(null);
    if (showSpinner) setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/reminders`);
      setReminders(res.data?.reminders ?? []);
    } catch (err) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to load reminders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const isFirst = !mountedRef.current;
      if (isFirst) mountedRef.current = true;
      loadReminders(isFirst);
    }, [loadReminders])
  );

  // ── Delete ─────────────────────────────────────────────────────────────
  function handleDelete(reminder) {
    Alert.alert(
      'Delete Reminder',
      `Delete "${reminder.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic update
            setReminders((prev) => prev.filter((r) => r.id !== reminder.id));

            try {
              // Cancel the scheduled notification first
              if (reminder.notificationId) {
                await Notifications.cancelScheduledNotificationAsync(
                  reminder.notificationId
                ).catch(() => {});
              }
              // Delete from Firestore
              await axios.delete(`${API_BASE}/api/reminders/${reminder.id}`);
            } catch (err) {
              const msg =
                err?.response?.data?.error ?? err?.message ?? 'Delete failed.';
              Alert.alert('Error', msg);
              // Revert optimistic update on failure
              setReminders((prev) => [...prev, reminder].sort(
                (a, b) => new Date(a.datetime) - new Date(b.datetime)
              ));
            }
          },
        },
      ]
    );
  }

  // ── States ──────────────────────────────────────────────────────────────
  if (loading) {
    return <SkeletonList />;
  }

  if (error) {
    return (
      <View style={s.centered}>
        <Text style={s.stateIcon}>⚠️</Text>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => { setError(null); loadReminders(true); }}
        >
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────
  return (
    <FlatList
      data={reminders}
      keyExtractor={(item) => item.id}
      style={{ backgroundColor: '#f7f7fb' }}
      contentContainerStyle={
        reminders.length === 0
          ? s.emptyContainer
          : { paddingTop: 16, paddingBottom: 32 }
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadReminders(false);
          }}
          colors={[PURPLE]}
          tintColor={PURPLE}
        />
      }
      ListHeaderComponent={
        <View>
          {!notifGranted && (
            <View style={s.notifBanner}>
              <Text style={s.notifBannerText}>
                🔕 Notifications are disabled. Enable them in Settings to receive reminders.
              </Text>
            </View>
          )}
          {reminders.length > 0 && (
            <Text style={s.swipeHint}>← Swipe left on any card to delete it</Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={s.emptyState}>
          <Text style={s.stateIcon}>🔔</Text>
          <Text style={s.emptyTitle}>No reminders yet.</Text>
          <Text style={s.emptySubtitle}>Tap the mic to add one.</Text>
          <TouchableOpacity
            style={s.goHomeBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={s.goHomeBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      }
      renderItem={({ item }) => (
        <SwipeableCard
          reminder={item}
          onDelete={() => handleDelete(item)}
          onPress={() => navigation.navigate('Edit', { reminder: item })}
        />
      )}
    />
  );
}

// ===========================================================================
// Styles
// ===========================================================================

// SwipeableCard styles
const sw = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom:     12,
    borderRadius:     14,
    overflow:         'hidden', // clips delete button when card is closed
  },
  deleteBtn: {
    position:         'absolute',
    right:            0,
    top:              0,
    bottom:           0,
    width:            DELETE_W,
    backgroundColor:  '#e74c3c',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              4,
  },
  deleteBtnIcon: {
    fontSize: 18,
  },
  deleteBtnText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '700',
  },
  cardAnim: {
    // White background ensures the card covers the delete button when closed
    backgroundColor: '#fff',
    borderRadius:    14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#ece9ff',
  },
  cardTop: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  cardTitle: {
    flex:       1,
    fontSize:   16,
    fontWeight: '700',
    color:      DARK,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#ece9ff',
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:      20,
  },
  badgeText: {
    fontSize:   11,
    fontWeight: '700',
    color:      PURPLE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDateTime: {
    fontSize:    13,
    color:       '#666',
    marginBottom: 4,
  },
  cardNote: {
    fontSize:  13,
    color:     '#999',
    marginTop: 2,
    lineHeight: 18,
  },
});

// Screen-level styles
const s = StyleSheet.create({
  centered: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#f7f7fb',
    padding:         24,
  },
  loadingText: {
    marginTop:  12,
    fontSize:   14,
    color:      '#888',
  },
  notifBanner: {
    backgroundColor: '#fff3cd',
    borderWidth:     1,
    borderColor:     '#ffd97d',
    borderRadius:    10,
    marginHorizontal: 16,
    marginBottom:    12,
    paddingHorizontal: 14,
    paddingVertical:  10,
  },
  notifBannerText: {
    fontSize:   13,
    color:      '#856404',
    fontWeight: '500',
    lineHeight: 18,
  },
  stateIcon: {
    fontSize:     48,
    marginBottom: 12,
  },
  errorText: {
    fontSize:     14,
    color:        '#666',
    textAlign:    'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: PURPLE,
    paddingHorizontal: 28,
    paddingVertical:   11,
    borderRadius:      12,
  },
  retryText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   15,
  },

  // Empty state
  emptyContainer: {
    flex:            1,
    backgroundColor: '#f7f7fb',
  },
  emptyState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop:     80,
  },
  emptyTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        DARK,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize:     14,
    color:        '#888',
    textAlign:    'center',
    marginBottom: 28,
  },
  goHomeBtn: {
    backgroundColor: PURPLE,
    paddingHorizontal: 32,
    paddingVertical:   13,
    borderRadius:      14,
  },
  goHomeBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   15,
  },
  swipeHint: {
    fontSize:         12,
    color:            '#aaa',
    textAlign:        'center',
    marginHorizontal: 16,
    marginBottom:     8,
    marginTop:        4,
    fontStyle:        'italic',
  },
});

// ── Skeleton styles ──
const sk = StyleSheet.create({
  container: {
    backgroundColor: '#f7f7fb',
    paddingTop:      16,
    paddingBottom:   32,
  },
  card: {
    backgroundColor:  '#e8e8f0',
    borderRadius:     14,
    padding:          16,
    marginHorizontal: 16,
    marginBottom:     12,
  },
  bar: {
    backgroundColor: '#d0cfe0',
    borderRadius:    6,
  },
});
