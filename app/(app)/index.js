import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Settings, LogOut, RefreshCw } from 'lucide-react-native';
import { PrimaryButton, SecondaryButton } from '../../components/PrimaryButton';
import { FiltersDrawer } from '../../components/FiltersDrawer';
import { ProgressBar } from '../../components/ProgressBar';
import { ResultsList } from '../../components/ResultsList';
import { ServerStatus } from '../../components/ServerStatus';
import * as ScraperAPI from '../../api/scraper';
import { useAuth } from '../../hooks/useAuth';

export default function HomeScreen() {
  const router = useRouter();
  const { handleLogout } = useAuth();

  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [newOnly, setNewOnly] = useState(false);
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [serverStatus, setServerStatus] = useState('checking');

  const categories = ScraperAPI.getCategories();
  let progressInterval = null;
  let statusInterval = null;

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const startProgressPolling = useCallback(() => {
    if (progressInterval) clearInterval(progressInterval);

    progressInterval = setInterval(async () => {
      try {
        const data = await ScraperAPI.getProgress();
        const done = Number(data.done) || 0;
        const total = Number(data.total) || 0;
        const pct = total > 0 ? (done / total) * 100 : 15;
        setProgress(pct);
        setStageLabel(data.phase || '');

        const labels = {
          '1/5 Zber sitemap': 'Sitemapy stiahnuté',
          '2/5 Prvé filtrovanie': 'Filtrované',
          '3/5 Sťahovanie inzerátov': 'Stiahnuté',
          '4/5 Filtrovanie popisov': 'Filtrované',
          '5/5 OpenAI filtrovanie': 'Vyhodnotené',
        };
        const prefix = labels[data.phase] ? labels[data.phase] + ': ' : '';
        setProgressLabel(`${prefix}${done}/${total}`);

        if (data.phase === 'Hotovo') {
          if (progressInterval) clearInterval(progressInterval);
          setIsRunning(false);
        }
      } catch (err) {
        if (progressInterval) clearInterval(progressInterval);
      }
    }, 1000);
  }, []);

  const startScrape = async (mode) => {
    try {
      setIsRunning(true);
      setProgress(0);
      setProgressLabel('');
      setStageLabel('');
      setResults([]);

      const useDateRange = !newOnly && dateStart && dateEnd;
      const filters = {
        subcategories: selectedCategories,
        date_start: useDateRange ? dateStart : null,
        date_end: useDateRange ? dateEnd : null,
        mode: mode,
      };

      startProgressPolling();
      const response = await ScraperAPI.startScrape(filters);
      setResults(response);
      setProgress(100);
      setProgressLabel('✅ Hotovo!');
      setIsRunning(false);
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri spracovaní');
      setIsRunning(false);
    }
  };

  const cancelScrape = async () => {
    try {
      await ScraperAPI.cancelScrape();
      if (progressInterval) clearInterval(progressInterval);
      setIsRunning(false);
      setProgress(0);
      setProgressLabel('');
      setStageLabel('');
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri zrušení');
    }
  };

  const restartApp = async () => {
    try {
      await ScraperAPI.restartScraper();
      Alert.alert('Info', 'Aplikácia bola reštartovaná. Počkaj ~1 minútu.');
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri reštarte');
    }
  };

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    try {
      await ScraperAPI.sendFeedback(feedbackText);
      setFeedbackText('');
      setShowFeedback(false);
      Alert.alert('Úspech', 'Spätná väzba bola odoslaná');
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri odoslaní');
    }
  };

  const handleDownload = async () => {
    try {
      const urls = results.map((it) => it.url || it);
      const text = urls.join('\n');
      await Share.share({
        message: text,
        title: 'Výsledky scraper',
      });
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri zdieľaní');
    }
  };

  const handleLogoutPress = async () => {
    await handleLogout();
    router.replace('/(auth)/login');
  };

  const checkServerStatus = async () => {
    if (serverStatus !== 'waking') {
      setServerStatus('checking');
    }
    const isOnline = await ScraperAPI.checkServerHealth();
    setServerStatus(isOnline ? 'online' : 'offline');
  };

  const handleWakeServer = async () => {
    setServerStatus('waking');
    await ScraperAPI.wakeServer();
    setTimeout(() => {
      checkServerStatus();
    }, 4000);
  };

  useEffect(() => {
    checkServerStatus();
    statusInterval = setInterval(checkServerStatus, 60000);
    return () => {
      if (statusInterval) clearInterval(statusInterval);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, []);

  const handleNewOnlyToggle = (value) => {
    setNewOnly(value);
    if (value) {
      setDateStart(null);
      setDateEnd(null);
    }
  };

  const ensureOrderedRange = (startValue, endValue) => {
    if (!startValue && !endValue) return { startValue, endValue };
    if (!startValue && endValue) return { startValue: endValue, endValue };
    if (startValue && !endValue) return { startValue, endValue: startValue };
    const startDate = new Date(`${startValue}T00:00:00`);
    const endDate = new Date(`${endValue}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { startValue, endValue };
    }
    if (startDate > endDate) {
      return { startValue, endValue: startValue };
    }
    return { startValue, endValue };
  };

  const handleDateStartChange = (value) => {
    if (!value) {
      setDateStart(null);
      return;
    }
    const { startValue, endValue } = ensureOrderedRange(value, dateEnd);
    setDateStart(startValue);
    setDateEnd(endValue);
  };

  const handleDateEndChange = (value) => {
    if (!value) {
      setDateEnd(null);
      return;
    }
    const { startValue, endValue } = ensureOrderedRange(dateStart, value);
    setDateStart(startValue);
    setDateEnd(endValue);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🔥 Inferno Scraper</Text>
          <Text style={styles.headerSubtitle}>Lead finder pre reality.bazos.sk</Text>
        </View>
        <View style={styles.headerActions}>
          <ServerStatus status={serverStatus} onWake={handleWakeServer} />
          <TouchableOpacity onPress={restartApp} style={styles.headerIcon}>
            <RefreshCw size={20} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogoutPress} style={styles.headerIcon}>
            <LogOut size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(true)}
          >
            <Settings size={16} color="#1f2937" />
            <Text style={styles.filterButtonText}>Zobraziť filtre</Text>
          </TouchableOpacity>

          <View style={styles.buttonsGroup}>
            <PrimaryButton
              title={isRunning ? 'Spúšťanie...' : 'Spustiť nový zber'}
              onPress={() => startScrape('new')}
              disabled={isRunning}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Predchádzajúce výsledky"
              onPress={() => startScrape('old')}
              disabled={isRunning}
              style={[{ flex: 1, backgroundColor: '#3b82f6' }]}
            />
          </View>

          {isRunning && (
            <View style={styles.cancelGroup}>
              <SecondaryButton
                title="❌ Zrušiť zber"
                onPress={cancelScrape}
              />
            </View>
          )}

          {(progress > 0 || progressLabel) && (
            <ProgressBar
              progress={progress}
              label={progressLabel}
              stageLabel={stageLabel}
            />
          )}

          {results.length > 0 && (
            <ResultsList
              items={results}
              count={results.length}
              onDownload={handleDownload}
            />
          )}

          <View style={styles.feedbackSection}>
            <SecondaryButton
              title="💬 Pridať kľúčové slovo"
              onPress={() => setShowFeedback(!showFeedback)}
            />

            {showFeedback && (
              <View style={styles.feedbackBox}>
                <TextInput
                  style={styles.feedbackInput}
                  placeholder="Navrhnite nové kľúčové slovo..."
                  multiline
                  numberOfLines={2}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                />
                <PrimaryButton
                  title="Odoslať"
                  onPress={sendFeedback}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <FiltersDrawer
        visible={showFilters}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStartChange={handleDateStartChange}
        onDateEndChange={handleDateEndChange}
        newOnly={newOnly}
        onNewOnly={handleNewOnlyToggle}
        onClose={() => setShowFilters(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 8,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  buttonsGroup: {
    gap: 8,
  },
  cancelGroup: {
    marginTop: 12,
  },
  feedbackSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  feedbackBox: {
    marginTop: 12,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
