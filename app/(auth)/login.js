import { useState, useContext } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthContext } from '../../context/AuthContext';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { handleLogin } = useContext(AuthContext);

  async function onLogin() {
    if (!password.trim()) {
      setError('Zadajte heslo');
      return;
    }

    setLoading(true);
    setError('');
    const success = await handleLogin(password);
    setLoading(false);

    if (!success) {
      setError('Nesprávne heslo');
      setPassword('');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>🔥 Inferno Scraper</Text>
        <Text style={styles.subtitle}>Lead finder pre reality.bazos.sk</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Zadaj heslo:</Text>
          <TextInput
            style={styles.input}
            placeholder="Heslo"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            autoFocus
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <PrimaryButton
            title={loading ? 'Prihlasovanie...' : 'Prihlásiť'}
            onPress={onLogin}
            disabled={loading}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  content: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: -8,
  },
});
