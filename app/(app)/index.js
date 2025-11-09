import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  const [lastFilters, setLastFilters] = useState(null);

  const progressIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const shouldAutoLoadResultsRef = useRef(false);

  const categories = ScraperAPI.getCategories();

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const loadLatestResults = useCallback(
    async (overrideFilters, options = {}) => {
      const { showErrors = true } = options;
      try {
        const baseFilters =
          overrideFilters ||
          lastFilters || {
            subcategories: selectedCategories,
            date_start: dateStart,
            date_end: dateEnd,
          };

        if (!baseFilters) {
          return false;
        }

        const response = await ScraperAPI.startScrape({
          ...baseFilters,
          mode: 'old',
        });

        const normalized = Array.isArray(response)
          ? response
          : Array.isArray(response?.results)
            ? response.results
            : [];
        setResults(normalized);
        return true;
      } catch (err) {
        if (showErrors) {
          Alert.alert('Chyba', 'Nepodarilo sa načítať výsledky');
        }
        return false;
      }
    },
    [dateEnd, dateStart, lastFilters, selectedCategories]
  );

  const startProgressPolling = useCallback(() => {
    if (progressIntervalRef.current)
      clearInterval(progressIntervalRef.current);

    progressIntervalRef.current = setInterval(async () => {
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
          if (progressIntervalRef.current)
            clearInterval(progressIntervalRef.current);
          setIsRunning(false);
          if (shouldAutoLoadResultsRef.current) {
            shouldAutoLoadResultsRef.current = false;
            await loadLatestResults(undefined, { showErrors: true });
          }
        }
      } catch (err) {
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
      }
    }, 1000);
  }, [loadLatestResults]);

  const useDateRange = useMemo(
    () => !newOnly && dateStart && dateEnd,
    [dateEnd, dateStart, newOnly]
  );

  const startScrape = async (mode) => {
    try {
      setIsRunning(true);
      setProgress(0);
      setProgressLabel('');
      setStageLabel('');
      setResults([]);

      const baseFilters = {
        subcategories: selectedCategories,
        date_start: useDateRange ? dateStart : null,
        date_end: useDateRange ? dateEnd : null,
      };

      setLastFilters(baseFilters);
      const payload = { ...baseFilters, mode };

      shouldAutoLoadResultsRef.current = mode === 'new';

      startProgressPolling();
      const response = await ScraperAPI.startScrape(payload);
      const normalized = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
          ? response.results
          : [];
      setResults(normalized);
      setProgress(100);
      setProgressLabel('✅ Hotovo!');
      setIsRunning(false);
      if (mode !== 'new') {
        shouldAutoLoadResultsRef.current = false;
      }
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri spracovaní');
      setIsRunning(false);
      shouldAutoLoadResultsRef.current = false;
    }
  };

  const cancelScrape = async () => {
    try {
      await ScraperAPI.cancelScrape();
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
      shouldAutoLoadResultsRef.current = false;
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

  const checkServerStatus = useCallback(async () => {
    setServerStatus((prev) => (prev !== 'waking' ? 'checking' : prev));
    const isOnline = await ScraperAPI.checkServerHealth();
    setServerStatus(isOnline ? 'online' : 'offline');
  }, []);

  const handleWakeServer = async () => {
    setServerStatus('waking');
    await ScraperAPI.wakeServer();
    setTimeout(() => {
      checkServerStatus();
    }, 4000);
  };

  useEffect(() => {
    checkServerStatus();
    statusIntervalRef.current = setInterval(checkServerStatus, 60000);
    return () => {
      if (statusIntervalRef.current)
        clearInterval(statusIntervalRef.current);
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    };
  }, [checkServerStatus]);

  const handleDateRangeChange = useCallback((startValue, endValue) => {
    if (!startValue && !endValue) {
      setDateStart(null);
      setDateEnd(null);
      return;
    }

    let nextStart = startValue || null;
    let nextEnd = endValue || null;

    if (nextStart && !nextEnd) {
      nextEnd = nextStart;
    } else if (!nextStart && nextEnd) {
      nextStart = nextEnd;
    }

    if (nextStart && nextEnd) {
      const startDate = new Date(`${nextStart}T00:00:00`);
      const endDate = new Date(`${nextEnd}T00:00:00`);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        if (startDate > endDate) {
          const tmp = nextStart;
          nextStart = nextEnd;
          nextEnd = tmp;
        }
      }
    }

    setDateStart(nextStart);
    setDateEnd(nextEnd);
  }, []);

  const handleNewOnlyToggle = (value) => {
    setNewOnly(value);
    if (value) {
      handleDateRangeChange(null, null);
    }
  };

  const handleLoadPreviousResults = useCallback(async () => {
    setIsRunning(true);
    setProgress(0);
    setProgressLabel('');
    setStageLabel('');
    shouldAutoLoadResultsRef.current = false;

    const baseFilters = {
      subcategories: selectedCategories,
      date_start: useDateRange ? dateStart : null,
      date_end: useDateRange ? dateEnd : null,
    };

    setLastFilters(baseFilters);

    const success = await loadLatestResults(baseFilters);
    if (success) {
      setProgress(100);
      setProgressLabel('✅ Hotovo!');
    }
    setIsRunning(false);
  }, [dateEnd, dateStart, loadLatestResults, selectedCategories, useDateRange]);

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
              onPress={handleLoadPreviousResults}
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
        onDateRangeChange={handleDateRangeChange}
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
