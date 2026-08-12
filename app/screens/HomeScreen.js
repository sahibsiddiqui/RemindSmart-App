import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Config — update to your machine's LAN IP when testing on a physical device
// ---------------------------------------------------------------------------
const API_BASE = 'http://10.21.170.164:3000'; // changed to my own's ntwk

// ---------------------------------------------------------------------------
// Notification handler (required by expo-notifications)
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// PulseRing — animated ring that pulses while recording
// ---------------------------------------------------------------------------
function PulseRing({ isRecording }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let loop;
    if (isRecording) {
      loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.6, duration: 800, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
    } else {
      scale.setValue(1);
      opacity.setValue(0.6);
    }
    return () => loop?.stop();
  }, [isRecording]);

  if (!isRecording) return null;

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { transform: [{ scale }], opacity },
      ]}
    />
  );
}

// ===========================================================================
// HomeScreen
// ===========================================================================
export default function HomeScreen({ navigation }) {
  // Voice state — disabled in Expo Go (native module not available)
  // Voice will be enabled via EAS dev build.
  const isRecording   = false;
  const transcript    = '';
  const micPermission = null;

  // Text input state
  const [typedText, setTypedText] = useState('');

  // Image state
  const [pickedImageUri, setPickedImageUri] = useState(null);

  // Shared loading state
  const [loading, setLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Permissions on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // Notification permission
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        console.warn('Notification permission not granted');
      }
    })();
  }, []);

  // -------------------------------------------------------------------------
  // Voice — disabled in Expo Go; will work in EAS dev build
  // -------------------------------------------------------------------------
  function handleMicPress() {
    Alert.alert(
      'Voice Input Unavailable',
      'Voice recognition requires a development build. Use text or image input for now.',
      [{ text: 'OK' }]
    );
  }

  // -------------------------------------------------------------------------
  // Core API call — shared by all 3 input paths
  // -------------------------------------------------------------------------
  async function parseReminder(text) {
    if (!text || !text.trim()) {
      Alert.alert('Empty input', 'Please provide some text before submitting.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/parse`, { text: text.trim() });
      const reminders = res.data?.reminders ?? [];
      navigation.navigate('Confirm', { reminders });
    } catch (err) {
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        'An unexpected error occurred.';
      Alert.alert('Error', msg, [{ text: 'Try again' }]);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Image picker
  // -------------------------------------------------------------------------
  async function handleImagePick() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Camera/gallery access is needed to scan documents.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert('Add Image', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const camPerm = await ImagePicker.requestCameraPermissionsAsync();
          if (camPerm.status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({
            base64: true,
            quality: 0.6,
          });
          if (!result.canceled && result.assets?.length) {
            const asset = result.assets[0];
            setPickedImageUri(asset.uri);
            const b64 = asset.base64 ?? '';
            await parseReminder(
              `Extract all reminder-relevant information from this prescription image: ${b64}`
            );
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.6,
          });
          if (!result.canceled && result.assets?.length) {
            const asset = result.assets[0];
            setPickedImageUri(asset.uri);
            const b64 = asset.base64 ?? '';
            await parseReminder(
              `Extract all reminder-relevant information from this prescription image: ${b64}`
            );
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <Text style={styles.heading}>What do you need to remember?</Text>
        <Text style={styles.subheading}>Speak, type, or scan a document</Text>

        {/* ════════════════════════════════════════════
            1. VOICE INPUT
        ════════════════════════════════════════════ */}
        <View style={styles.voiceSection}>
          {/* Pulse ring sits behind the button */}
          <View style={styles.micWrapper}>
            <PulseRing isRecording={isRecording} />
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive]}
              onPress={handleMicPress}
              activeOpacity={0.8}
            >
              {/* Mic icon using unicode — no external icon library needed */}
              <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎙'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.micHint}>
            {isRecording
              ? 'Listening… tap to stop'
              : micPermission === false
                ? '⚠ Microphone permission denied'
                : 'Tap to speak your reminder'}
          </Text>

          {/* Transcript preview */}
          {!!transcript && (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>Heard:</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
              <TouchableOpacity
                style={styles.useThisButton}
                onPress={() => parseReminder(transcript)}
                disabled={loading}
              >
                <Text style={styles.useThisText}>Use this ›</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════
            2. TEXT INPUT
        ════════════════════════════════════════════ */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or type</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.textSection}>
          <TextInput
            style={styles.textInput}
            placeholder="Or type your reminder here..."
            placeholderTextColor="#888"
            multiline
            numberOfLines={4}
            value={typedText}
            onChangeText={setTypedText}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.submitButton, (!typedText.trim() || loading) && styles.buttonDisabled]}
            onPress={() => parseReminder(typedText)}
            disabled={!typedText.trim() || loading}
          >
            <Text style={styles.submitText}>Submit</Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════════════════════════════════
            3. IMAGE INPUT
        ════════════════════════════════════════════ */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or scan</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.imageButton}
          onPress={handleImagePick}
          disabled={loading}
          activeOpacity={0.7}
        >
          {pickedImageUri ? (
            <Image source={{ uri: pickedImageUri }} style={styles.pickedThumbnail} />
          ) : (
            <Text style={styles.cameraIcon}>📷</Text>
          )}
          <Text style={styles.imageButtonText}>Scan prescription or document</Text>
        </TouchableOpacity>

        {/* ── Global loading overlay ── */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6c63ff" />
            <Text style={styles.loadingText}>Analysing…</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const PURPLE = '#6c63ff';
const DARK = '#1a1a2e';
const CARD = '#f4f3ff';

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 36,
    alignItems: 'center',
  },

  // ── Header ──
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: DARK,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 36,
  },

  // ── Voice ──
  voiceSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  micWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: PURPLE,
  },
  micButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: '#e74c3c',
    shadowColor: '#e74c3c',
  },
  micIcon: {
    fontSize: 34,
  },
  micHint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    textAlign: 'center',
  },

  // ── Transcript ──
  transcriptBox: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd9ff',
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PURPLE,
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  transcriptText: {
    fontSize: 15,
    color: DARK,
    lineHeight: 22,
    marginBottom: 12,
  },
  useThisButton: {
    alignSelf: 'flex-end',
    backgroundColor: PURPLE,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
  },
  useThisText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Dividers ──
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8e8e8',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#aaa',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Text input ──
  textSection: {
    width: '100%',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: DARK,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // ── Image picker ──
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 14,
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    gap: 12,
  },
  cameraIcon: {
    fontSize: 26,
  },
  imageButtonText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
    flex: 1,
  },
  pickedThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },

  // ── Loading overlay (inline, below inputs) ──
  loadingOverlay: {
    marginTop: 24,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: PURPLE,
    fontWeight: '600',
  },
});
