import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import ConfirmScreen from './screens/ConfirmScreen';
import RemindersListScreen from './screens/RemindersListScreen';
import EditReminderScreen from './screens/EditReminderScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        {/* Home → Confirm (params: reminders[]) */}
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'RemindSmart' }}
        />

        {/* Confirm → RemindersList */}
        <Stack.Screen
          name="Confirm"
          component={ConfirmScreen}
          options={{ title: 'Confirm Reminders' }}
        />

        {/* RemindersList → Edit (params: reminder{}) */}
        <Stack.Screen
          name="RemindersList"
          component={RemindersListScreen}
          options={{ title: 'My Reminders' }}
        />

        <Stack.Screen
          name="Edit"
          component={EditReminderScreen}
          options={{ title: 'Edit Reminder' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
