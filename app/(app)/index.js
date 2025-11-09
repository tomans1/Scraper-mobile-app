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

const INITIAL_JOB_STATE = {
  status: 'idle',
  mode: null,
  started_at: null,
  finished_at: null,
  results_ready: false,
  error: null,
  phase: '',
  done: 0,
  total: 0,
  last_count: 0,
};

const SOFT_RESET_ANY_JOB = '__SOFT_RESET_ANY__';

export default function HomeScreen() {
  const router = useRouter();
  const { handleLogout } = useAuth();

  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [newOnly, setNewOnly] = useState(false);
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [jobState, setJobState] = useState(() => ({ ...INITIAL_JOB_STATE }));
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [results, setResults] = useState([]);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [serverStatus, setServerStatus] = useState('checking');
  const [lastFilters, setLastFilters] = useState(null);

  const jobStatusIntervalRef = useRef(null);
  const serverStatusIntervalRef = useRef(null);
  const pendingResultsJobRef = useRef(null);
  const lastNotifiedErrorRef = useRef(null);
  const jobStateRef = useRef(INITIAL_JOB_STATE);
  const suppressJobUpdatesRef = useRef(false);
  const suppressedJobIdRef = useRef(null);

  const categories = ScraperAPI.getCategories();

  const softResetUI = useCallback(
    (options = {}) => {
      const { skipNavigation = false } = options;
      const previousJobId = jobStateRef.current?.started_at || null;
      setShowFilters(false);
      setResults([]);
      setResultsExpanded(false);
      setProgress(0);
      setProgressLabel('');
      setStageLabel('');
      setShowFeedback(false);
      setFeedbackText('');
      setLastFilters(null);
      setJobState({ ...INITIAL_JOB_STATE });
      jobStateRef.current = { ...INITIAL_JOB_STATE };
      suppressJobUpdatesRef.current = true;
      suppressedJobIdRef.current = previousJobId || SOFT_RESET_ANY_JOB;
      pendingResultsJobRef.current = null;
      lastNotifiedErrorRef.current = null;
      if (!skipNavigation) {
        router.replace('/');
      }
    },
    [router]
  );

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const loadLatestResults = useCallback(
    async (overrideFilters, options = {}) => {
      const { showErrors = true, mode = 'latest' } = options;
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

        const response =
          mode === 'latest'
            ? await ScraperAPI.fetchLatestResults(baseFilters)
            : await ScraperAPI.fetchResults(baseFilters);

        const normalized = Array.isArray(response)
          ? response
          : Array.isArray(response?.results)
            ? response.results
            : [];

        setResults(normalized);
        setResultsExpanded(normalized.length > 0);
        setJobState((prev) => ({
          ...prev,
          last_count: normalized.length,
          results_ready: normalized.length > 0,
        }));
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

  const useDateRange = useMemo(
    () => !newOnly && dateStart && dateEnd,
    [dateEnd, dateStart, newOnly]
  );

  const pollJobStatus = useCallback(async () => {
    try {
      const data = await ScraperAPI.getJobStatus();
      const phase = data?.phase || '';
      const doneValue = Number(data?.done) || 0;
      const totalValue = Number(data?.total) || 0;
      const job = data?.job || {};
      const status = job.status || 'idle';

      const effectivePhase = job.phase || phase || '';
      const effectiveDone = Number.isFinite(Number(job.done))
        ? Number(job.done)
        : doneValue;
      const effectiveTotal = Number.isFinite(Number(job.total))
        ? Number(job.total)
        : totalValue;

      const stageLabels = {
        '1/5 Zber sitemap': 'Zber sitemap',
        '2/5 Prvé filtrovanie': 'Prvé filtrovanie',
        '3/5 Sťahovanie inzerátov': 'Sťahovanie inzerátov',
        '4/5 Filtrovanie popisov': 'Filtrovanie popisov',
        '5/5 OpenAI filtrovanie': 'OpenAI filtrovanie',
      };

      const jobStartedAt = job.started_at || null;
      const isTerminalStatus = ['finished', 'failed', 'cancelled'].includes(status);
      const currentSessionStartedAt = jobStateRef.current?.started_at || null;
      const pendingJobId = pendingResultsJobRef.current;
      const isCurrentSessionJob =
        currentSessionStartedAt &&
        jobStartedAt &&
        currentSessionStartedAt === jobStartedAt;
      const isPendingSessionJob =
        pendingJobId && jobStartedAt && pendingJobId === jobStartedAt;
      const allowTerminalDisplay =
        !isTerminalStatus || isCurrentSessionJob || isPendingSessionJob;

      const displayStatus = allowTerminalDisplay ? status : 'idle';
      const displayPhase = allowTerminalDisplay ? effectivePhase : '';
      const displayDone = allowTerminalDisplay ? effectiveDone : 0;
      const displayTotal = allowTerminalDisplay ? effectiveTotal : 0;
      const nextJobState = {
        ...job,
        status: displayStatus,
        phase: displayPhase,
        done: displayDone,
        total: displayTotal,
        results_ready: allowTerminalDisplay ? job.results_ready : false,
        started_at: allowTerminalDisplay ? jobStartedAt : null,
      };

      if (suppressJobUpdatesRef.current) {
        const suppressedId = suppressedJobIdRef.current;
        const isActive = status === 'running' || status === 'starting';
        const startedChanged =
          jobStartedAt &&
          suppressedId &&
          suppressedId !== SOFT_RESET_ANY_JOB &&
          jobStartedAt !== suppressedId;
        if (isActive || startedChanged) {
          suppressJobUpdatesRef.current = false;
          suppressedJobIdRef.current = null;
        }
      }

      const suppressedId = suppressedJobIdRef.current;
      const shouldSuppressUi =
        suppressJobUpdatesRef.current &&
        !['running', 'starting'].includes(status) &&
        (
          suppressedId === SOFT_RESET_ANY_JOB ||
          (suppressedId && jobStartedAt && suppressedId === jobStartedAt)
        );

      setJobState((prev) => ({
        ...prev,
        ...nextJobState,
        phase: nextJobState.phase,
        done: nextJobState.done,
        total: nextJobState.total,
      }));

      if (shouldSuppressUi) {
        setStageLabel('');
        setProgress(0);
        setProgressLabel('');
      } else {
        const baseStage =
          stageLabels[displayPhase] || (displayPhase === 'Hotovo' ? '' : displayPhase);

        let nextStageLabel = baseStage;
        if (displayStatus === 'finished') {
          nextStageLabel = '✅ Zber dokončený';
        } else if (displayStatus === 'failed' || displayStatus === 'cancelled') {
          nextStageLabel = '';
        }
        setStageLabel(nextStageLabel);

        const isActive = displayStatus === 'running' || displayStatus === 'starting';
        const progressValue = displayTotal > 0
          ? Math.min(100, (displayDone / displayTotal) * 100)
          : isActive
            ? 10
            : displayStatus === 'finished'
              ? 100
              : 0;
        setProgress(progressValue);

        let label = '';
        if (displayStatus === 'starting') {
          label = 'Pripravujem zber...';
        } else if (displayStatus === 'running') {
          const prefix = stageLabels[displayPhase]
            ? `${stageLabels[displayPhase]}: `
            : '';
          if (displayTotal > 1) {
            label = `${prefix}${displayDone}/${displayTotal}`;
          } else if (prefix) {
            label = prefix.trim();
          } else {
            label = 'Spracúvam...';
          }
        } else if (displayStatus === 'finished') {
          const count = job.last_count ?? displayDone;
          label = `✅ Výsledky pripravené (${count || 0})`;
        } else if (displayStatus === 'failed') {
          label = '❌ Zber zlyhal';
        } else if (displayStatus === 'cancelled') {
          label = '⏹️ Zber zrušený';
        } else if (displayStatus === 'restarting') {
          label = 'Reštart servera prebieha';
        }
        setProgressLabel(label);
      }

      const startedAt = job.started_at;
      if (!shouldSuppressUi && status === 'finished' && job.results_ready && startedAt && pendingResultsJobRef.current === startedAt) {
        const success = await loadLatestResults(undefined, { showErrors: true, mode: 'latest' });
        if (success) {
          pendingResultsJobRef.current = null;
        }
      }

      if (['failed', 'cancelled'].includes(status)) {
        pendingResultsJobRef.current = null;
      }

      if (status === 'failed' && job.error && lastNotifiedErrorRef.current !== job.error) {
        Alert.alert('Chyba', job.error);
        lastNotifiedErrorRef.current = job.error;
      }
      if (status !== 'failed') {
        lastNotifiedErrorRef.current = null;
      }
    } catch (err) {
      // Silently ignore transient errors
    }
  }, [loadLatestResults]);
  const startScrape = async () => {
    if (['running', 'starting'].includes(jobState.status)) {
      return;
    }

    const baseFilters = {
      subcategories: selectedCategories,
      date_start: useDateRange ? dateStart : null,
      date_end: useDateRange ? dateEnd : null,
    };

    suppressJobUpdatesRef.current = false;
    suppressedJobIdRef.current = null;
    setLastFilters(baseFilters);
    setResults([]);
    setResultsExpanded(false);
    setProgress(0);
    setProgressLabel('Pripravujem zber...');
    setStageLabel('');

    const provisionalId = new Date().toISOString();
    pendingResultsJobRef.current = provisionalId;
    lastNotifiedErrorRef.current = null;
    setJobState({
      ...INITIAL_JOB_STATE,
      status: 'starting',
      mode: 'new',
      started_at: provisionalId,
    });

    try {
      const response = await ScraperAPI.startScrape({ ...baseFilters, mode: 'new' });
      const jobInfo = response?.status || response?.job;

      if (response?.ok === false) {
        if (jobInfo) {
          setJobState((prev) => ({ ...prev, ...jobInfo }));
          pendingResultsJobRef.current = jobInfo.started_at || null;
        }
        Alert.alert('Info', response?.error || 'Zber už prebieha.');
        return;
      }

      const startedAt = jobInfo?.started_at || provisionalId;
      pendingResultsJobRef.current = startedAt;

      setJobState((prev) => ({
        ...prev,
        ...jobInfo,
        status: jobInfo?.status || 'starting',
        mode: 'new',
        started_at: startedAt,
        results_ready: false,
        error: null,
        last_count: 0,
      }));
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri spustení zberu');
      pendingResultsJobRef.current = null;
      setJobState({ ...INITIAL_JOB_STATE });
    }
  };

  const cancelScrape = async () => {
    try {
      const response = await ScraperAPI.cancelScrape();
      pendingResultsJobRef.current = null;
      setProgress(0);
      setProgressLabel('');
      setStageLabel('');
      const status = response?.status;
      if (status) {
        setJobState((prev) => ({ ...prev, ...status }));
      } else {
        setJobState({ ...INITIAL_JOB_STATE, status: 'cancelled' });
      }
    } catch (err) {
      Alert.alert('Chyba', 'Chyba pri zrušení');
    }
  };

  const restartApp = () => {
    Alert.alert(
      'Resetovať zber?',
      'Týmto sa reštartuje backend. Prosím, počkajte 1–2 minúty a počas tohto času aplikáciu nepoužívajte.',
      [
        { text: 'Zrušiť', style: 'cancel' },
        {
          text: 'Resetovať',
          style: 'destructive',
          onPress: () => {
            (async () => {
              try {
                await ScraperAPI.restartScraper();
                setJobState((prev) => ({ ...prev, status: 'restarting', results_ready: false }));
                pendingResultsJobRef.current = null;
                Alert.alert('Info', 'Backend sa reštartuje. Počkajte 1–2 minúty.');
                setTimeout(() => {
                  softResetUI();
                }, 2500);
              } catch (err) {
                Alert.alert('Chyba', 'Chyba pri reštarte');
              }
            })();
          },
        },
      ]
    );
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
    jobStateRef.current = jobState;
  }, [jobState]);

  useEffect(() => {
    pollJobStatus();
    jobStatusIntervalRef.current = setInterval(pollJobStatus, 1500);
    return () => {
      if (jobStatusIntervalRef.current)
        clearInterval(jobStatusIntervalRef.current);
    };
  }, [pollJobStatus]);

  useEffect(() => {
    checkServerStatus();
    serverStatusIntervalRef.current = setInterval(checkServerStatus, 60000);
    return () => {
      if (serverStatusIntervalRef.current)
        clearInterval(serverStatusIntervalRef.current);
      if (jobStatusIntervalRef.current)
        clearInterval(jobStatusIntervalRef.current);
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
    setProgress(0);
    setProgressLabel('Načítavam výsledky...');
    setStageLabel('');
    pendingResultsJobRef.current = null;
    suppressJobUpdatesRef.current = false;
    suppressedJobIdRef.current = null;

    jobStateRef.current = {
      ...jobStateRef.current,
      status: 'idle',
      started_at: null,
      results_ready: false,
      phase: '',
      done: 0,
      total: 0,
    };
    setJobState((prev) => ({
      ...prev,
      status: 'idle',
      started_at: null,
      results_ready: false,
      phase: '',
      done: 0,
      total: 0,
    }));

    const baseFilters = {
      subcategories: selectedCategories,
      date_start: useDateRange ? dateStart : null,
      date_end: useDateRange ? dateEnd : null,
    };

    setLastFilters(baseFilters);

    const success = await loadLatestResults(baseFilters, { mode: 'old' });
    setProgress(0);
    setStageLabel('');
    setProgressLabel('');
  }, [dateEnd, dateStart, loadLatestResults, selectedCategories, useDateRange]);

  const isRunning = jobState.status === 'running' || jobState.status === 'starting';
  const showKillButton = jobState.status === 'running' || jobState.status === 'starting';
  const disableStart = isRunning || jobState.status === 'restarting';
  const handleHeaderPress = useCallback(() => {
    softResetUI({ skipNavigation: true });
  }, [softResetUI]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleHeaderPress}
          style={styles.headerTitleWrapper}
          activeOpacity={0.7}
        >
          <Text style={styles.headerTitle}>🔥 Inferno Scraper</Text>
          <Text style={styles.headerSubtitle}>Lead finder pre reality.bazos.sk</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {showKillButton && (
            <TouchableOpacity onPress={cancelScrape} style={styles.killButton}>
              <Text style={styles.killButtonText}>❌ Zrušiť zber</Text>
            </TouchableOpacity>
          )}
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
              onPress={startScrape}
              disabled={disableStart}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Predchádzajúce výsledky"
              onPress={handleLoadPreviousResults}
              disabled={isRunning || jobState.status === 'restarting'}
              style={[{ flex: 1, backgroundColor: '#3b82f6' }]}
            />
          </View>

          {(progress > 0 || progressLabel || stageLabel) && (
            <ProgressBar
              progress={progress}
              label={progressLabel}
              stageLabel={stageLabel}
            />
          )}

          {results.length > 0 && (
            <View style={styles.resultsSection}>
              <TouchableOpacity
                onPress={() => setResultsExpanded((prev) => !prev)}
                style={styles.resultsToggle}
              >
                <Text style={styles.resultsToggleText}>
                  {resultsExpanded ? 'Skryť výsledky' : 'Zobraziť výsledky'} ({results.length})
                </Text>
              </TouchableOpacity>
              {resultsExpanded && (
                <ResultsList
                  items={results}
                  count={results.length}
                  onDownload={handleDownload}
                />
              )}
            </View>
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
  headerTitleWrapper: {
    flexShrink: 1,
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
  killButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  killButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 12,
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
  resultsSection: {
    marginTop: 24,
  },
  resultsToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  resultsToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
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
