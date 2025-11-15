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
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedZips, setSelectedZips] = useState([]);
  const [newOnly, setNewOnly] = useState(false);
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [allResults, setAllResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [availableFilters, setAvailableFilters] = useState({
    subcategories: [],
    cities: [],
    zips: [],
    dateRange: { min: null, max: null },
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [serverStatus, setServerStatus] = useState('checking');

  const categories = ScraperAPI.getCategories();
  let progressInterval = null;
  let statusInterval = null;

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) => {
      const updated = prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat];
      return updated;
    });
  };

  const toggleCity = (city) => {
    setSelectedCities((prev) => {
      const updated = prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city];
      return updated;
    });
  };

  const toggleZip = (zip) => {
    setSelectedZips((prev) => {
      const updated = prev.includes(zip) ? prev.filter((z) => z !== zip) : [...prev, zip];
      return updated;
    });
  };

  const initializeFiltersFromResults = (results) => {
    if (!Array.isArray(results) || results.length === 0) {
      setAvailableFilters({
        subcategories: [],
        cities: [],
        zips: [],
        dateRange: { min: null, max: null },
      });
      return;
    }

    const subcats = new Set();
    const cities = new Set();
    const zips = new Set();
    const dates = [];

    results.forEach((item) => {
      if (item.subcat) subcats.add(item.subcat);
      if (item.city && item.city !== 'N/A') cities.add(item.city);
      if (item.zip_code && item.zip_code !== 'N/A') zips.add(item.zip_code);
      if (item.date) {
        const parsed = parseDate(item.date);
        if (parsed) dates.push(parsed);
      }
    });

    const minDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    setAvailableFilters({
      subcategories: Array.from(subcats).sort(),
      cities: Array.from(cities).sort(),
      zips: Array.from(zips).sort(),
      dateRange: { min: minDate, max: maxDate },
    });
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return new Date(year, month - 1, day).getTime();
    }
    return null;
  };

  const applyFiltersToResults = (results = allResults) => {
    let filtered = [...results];

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((item) => selectedCategories.includes(item.subcat));
    }

    if (selectedCities.length > 0) {
      filtered = filtered.filter((item) => selectedCities.includes(item.city));
    }

    if (selectedZips.length > 0) {
      filtered = filtered.filter((item) => selectedZips.includes(item.zip_code));
    }

    if (newOnly && availableFilters.dateRange.max) {
      const maxDate = availableFilters.dateRange.max.getTime();
      filtered = filtered.filter((item) => {
        const itemDate = parseDate(item.date);
        return itemDate === maxDate;
      });
    } else if (dateStart && dateEnd) {
      const startTime = new Date(dateStart).getTime();
      const endTime = new Date(dateEnd).getTime();
      filtered = filtered.filter((item) => {
        const itemDate = parseDate(item.date);
        return itemDate && itemDate >= startTime && itemDate <= endTime;
      });
    }

    setFilteredResults(filtered);
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
      setAllResults([]);
      setFilteredResults([]);
      setShowFilters(false);

      const filters = {
        mode: mode,
        date_start: null,
        date_end: null,
      };

      startProgressPolling();
      const response = await ScraperAPI.startScrape(filters);

      // Store raw results and initialize filters
      setAllResults(response);
      initializeFiltersFromResults(response);
      applyFiltersToResults(response);

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
      const urls = filteredResults.map((it) => it.url || it);
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

  useEffect(() => {
    if (allResults.length > 0) {
      applyFiltersToResults();
    }
  }, [selectedCategories, selectedCities, selectedZips]);

  const handleNewOnlyToggle = (value) => {
    setNewOnly(value);
    if (value) {
      setDateStart(null);
      setDateEnd(null);
    }
    applyFiltersToResults();
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
    applyFiltersToResults();
  };

  const handleDateEndChange = (value) => {
    if (!value) {
      setDateEnd(null);
      return;
    }
    const { startValue, endValue } = ensureOrderedRange(dateStart, value);
    setDateStart(startValue);
    setDateEnd(endValue);
    applyFiltersToResults();
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
          {allResults.length > 0 && (
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilters(true)}
            >
              <Settings size={16} color="#1f2937" />
              <Text style={styles.filterButtonText}>Zobraziť filtre</Text>
            </TouchableOpacity>
          )}

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

          {filteredResults.length > 0 && (
            <ResultsList
              items={filteredResults}
              count={filteredResults.length}
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

      {allResults.length > 0 && (
        <FiltersDrawer
          visible={showFilters}
          availableFilters={availableFilters}
          selectedCategories={selectedCategories}
          selectedCities={selectedCities}
          selectedZips={selectedZips}
          onToggleCategory={toggleCategory}
          onToggleCity={toggleCity}
          onToggleZip={toggleZip}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateStartChange={handleDateStartChange}
          onDateEndChange={handleDateEndChange}
          newOnly={newOnly}
          onNewOnly={handleNewOnlyToggle}
          onApplyFilters={() => applyFiltersToResults()}
          onClose={() => setShowFilters(false)}
        />
      )}
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
