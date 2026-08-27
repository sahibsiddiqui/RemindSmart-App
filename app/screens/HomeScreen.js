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
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
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
  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef  = useRef(null);

  // Text input state
  const [typedText, setTypedText] = useState('');

  // Image state
  const [pickedImageUri, setPickedImageUri] = useState(null);

  // Shared loading state + dynamic label
  const [loading,      setLoading]      = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Understanding your reminder…');

  // Banner shown below mic button for errors / hints
  const [micBannerMsg, setMicBannerMsg] = useState('');

  // -------------------------------------------------------------------------
  // Permissions on mount + cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') console.warn('Notification permission not granted');
    })();

    // Stop any in-progress recording if the screen is unmounted
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Voice recording — works in Expo Go via expo-av + Gemini audio API
  // -------------------------------------------------------------------------
  async function handleMicPress() {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setMicBannerMsg('🔴 Microphone permission denied. Enable it in device Settings.');
        return;
      }
      setMicBannerMsg('');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      setMicBannerMsg(`🔴 Couldn't start recording: ${err.message}`);
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setMicBannerMsg('🔴 No audio captured. Please try again.');
        return;
      }

      // Reset audio mode so playback works normally again
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

      // Read audio file as base64 and send to server
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await parseFromAudio(base64);
    } catch (err) {
      setIsRecording(false);
      setMicBannerMsg(`🔴 Recording error: ${err.message}`);
    }
  }

  async function parseFromAudio(base64Audio) {
    setLoadingLabel('Transcribing your voice…');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/parse`, {
        audio:    base64Audio,
        mimeType: 'audio/m4a',
      });
      const reminders = res.data?.reminders ?? [];
      navigation.navigate('Confirm', { reminders });
    } catch (err) {
      const serverError = err?.response?.data?.error ?? '';
      const isMalformed =
        serverError.toLowerCase().includes('malformed') ||
        serverError.toLowerCase().includes('parse');
      Alert.alert(
        isMalformed ? "Couldn't Understand" : 'Error',
        isMalformed
          ? "Couldn't understand that audio. Try speaking more clearly or use text input."
          : (serverError || err?.message || 'An unexpected error occurred.'),
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
      setLoadingLabel('Understanding your reminder…');
    }
  }

  // -------------------------------------------------------------------------
  // Core API call — shared by all 3 input paths
  // -------------------------------------------------------------------------
  async function parseReminder(text) {
    if (!text || !text.trim()) {
      Alert.alert('Empty input', 'Please provide some text before submitting.');
      return;
    }

    setLoadingLabel('Understanding your reminder…');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/parse`, { text: text.trim() });
      const reminders = res.data?.reminders ?? [];
      navigation.navigate('Confirm', { reminders });
    } catch (err) {
      const serverError = err?.response?.data?.error ?? '';
      const isMalformed =
        serverError.toLowerCase().includes('malformed') ||
        serverError.toLowerCase().includes('parse');
      const alertTitle = isMalformed ? "Couldn't Understand" : 'Error';
      const alertMsg = isMalformed
        ? "Couldn't understand that. Try rephrasing or use text input."
        : (serverError || err?.message || 'An unexpected error occurred.');
      Alert.alert(alertTitle, alertMsg, [{ text: 'OK' }]);
      setTypedText('');
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
            {isRecording ? '🔴 Recording… tap to stop' : 'Tap to speak your reminder'}
          </Text>

          {/* Voice unavailable banner */}
          {!!micBannerMsg && (
            <View style={styles.micBanner}>
              <Text style={styles.micBannerText}>{micBannerMsg}</Text>
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
            <Text style={styles.loadingText}>{loadingLabel}</Text>
          </View>
        )}


        {/* ── View All Reminders shortcut ── */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => navigation.navigate('RemindersList')}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text style={styles.viewAllText}>🔔  View All Reminders</Text>
        </TouchableOpacity>

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
    marginBottom: 8,
    textAlign: 'center',
  },
  micBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#ffd97d',
  },
  micBannerText: {
    fontSize: 13,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '500',
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

  // ── View All Reminders button ──
  viewAllBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    borderWidth:       1.5,
    borderColor:       PURPLE,
    borderRadius:      14,
    paddingVertical:   13,
    width:             '100%',
  },
  viewAllText: {
    fontSize:   15,
    fontWeight: '700',
    color:      PURPLE,
  },
});
