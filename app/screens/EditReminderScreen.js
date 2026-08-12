import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * EditReminderScreen
 * Route params: { reminder: Object }
 */
export default function EditReminderScreen({ route }) {
  const reminder = route?.params?.reminder ?? {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EditReminderScreen</Text>
      {reminder?.id ? (
        <Text style={styles.subtitle}>Editing reminder: {reminder.id}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
});
