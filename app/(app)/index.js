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
  const latestResultsRunRef = useRef(null);
  const resultsModeRef = useRef('latest');
  const resultsRequestRef = useRef(null);

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
      latestResultsRunRef.current = null;
      resultsModeRef.current = 'latest';
      resultsRequestRef.current = null;
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
      const { showErrors = true, mode = 'latest', jobId = null } = options;
      const requestToken = Symbol('resultsRequest');
      resultsRequestRef.current = { token: requestToken, mode };
      const previousMode = resultsModeRef.current;
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

        if (mode === 'latest') {
          if (jobId && latestResultsRunRef.current && jobId !== latestResultsRunRef.current) {
            return false;
          }
          if (jobId) {
            latestResultsRunRef.current = jobId;
          }
          resultsModeRef.current = 'latest';
        } else {
          if (resultsModeRef.current !== 'history') {
            return false;
          }
          resultsModeRef.current = 'history';
        }

        if (resultsRequestRef.current?.token !== requestToken) {
          return false;
        }

        setResults(normalized);
        setResultsExpanded(normalized.length > 0);
        return true;
      } catch (err) {
        resultsModeRef.current = previousMode;
        if (showErrors) {
          Alert.alert('Chyba', 'Nepodarilo sa načítať výsledky');
        }
        return false;
      } finally {
        if (resultsRequestRef.current?.token === requestToken) {
          resultsRequestRef.current = null;
        }
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
        ...job,
        phase: job.phase ?? effectivePhase,
        done: Number.isFinite(Number(job.done)) ? Number(job.done) : effectiveDone,
        total: Number.isFinite(Number(job.total)) ? Number(job.total) : effectiveTotal,
      }));

      if (shouldSuppressUi) {
        setStageLabel('');
        setProgress(0);
        setProgressLabel('');
      } else {
        const baseStage = stageLabels[effectivePhase] || (effectivePhase === 'Hotovo' ? '' : effectivePhase);

        let nextStageLabel = baseStage;
        if (status === 'finished') {
          nextStageLabel = '✅ Zber dokončený';
        } else if (status === 'failed') {
          nextStageLabel = '❌ Zber zlyhal';
        } else if (status === 'cancelled') {
          nextStageLabel = 'Zber bol zrušený';
        }
        setStageLabel(nextStageLabel);

        const isActive = status === 'running' || status === 'starting';
        const progressValue = effectiveTotal > 0
          ? Math.min(100, (effectiveDone / effectiveTotal) * 100)
          : isActive
            ? 10
            : status === 'finished'
              ? 100
              : 0;
        setProgress(progressValue);

        let label = '';
        if (status === 'starting') {
          label = 'Pripravujem zber...';
        } else if (status === 'running') {
          const prefix = stageLabels[effectivePhase]
            ? `${stageLabels[effectivePhase]}: `
            : '';
          if (effectiveTotal > 1) {
            label = `${prefix}${effectiveDone}/${effectiveTotal}`;
          } else if (prefix) {
            label = prefix.trim();
          } else {
            label = 'Spracúvam...';
          }
        } else if (status === 'finished') {
          const count = job.last_count ?? effectiveDone;
          label = `✅ Výsledky pripravené (${count || 0})`;
        } else if (status === 'failed') {
          label = '❌ Zber zlyhal';
        } else if (status === 'cancelled') {
          label = '⏹️ Zber zrušený';
        } else if (status === 'restarting') {
          label = 'Reštart servera prebieha';
        }
        setProgressLabel(label);
      }

      const startedAt = job.started_at;
      if (startedAt && ['running', 'starting', 'finished'].includes(status)) {
        latestResultsRunRef.current = startedAt;
      }
      if (!shouldSuppressUi && status === 'finished' && job.results_ready && startedAt && pendingResultsJobRef.current === startedAt) {
        const success = await loadLatestResults(undefined, {
          showErrors: true,
          mode: 'latest',
          jobId: startedAt,
        });
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
    resultsModeRef.current = 'latest';
    resultsRequestRef.current = null;

    const provisionalId = new Date().toISOString();
    pendingResultsJobRef.current = provisionalId;
    lastNotifiedErrorRef.current = null;
    latestResultsRunRef.current = provisionalId;
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
          latestResultsRunRef.current = jobInfo.started_at || null;
        }
        Alert.alert('Info', response?.error || 'Zber už prebieha.');
        return;
      }

      const startedAt = jobInfo?.started_at || provisionalId;
      pendingResultsJobRef.current = startedAt;
      latestResultsRunRef.current = startedAt;

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
      latestResultsRunRef.current = null;
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
    setProgressLabel('Načítavam výsledky...');
    setStageLabel('');
    pendingResultsJobRef.current = null;
    suppressJobUpdatesRef.current = false;
    suppressedJobIdRef.current = null;

    const baseFilters = {
      subcategories: selectedCategories,
      date_start: useDateRange ? dateStart : null,
      date_end: useDateRange ? dateEnd : null,
    };

    setLastFilters(baseFilters);

    const previousMode = resultsModeRef.current;
    resultsModeRef.current = 'history';
    const success = await loadLatestResults(baseFilters, { mode: 'old' });
    if (success) {
      setProgress(0);
      setProgressLabel('Predchádzajúce výsledky načítané');
      setStageLabel('');
    } else {
      setProgressLabel('');
      resultsModeRef.current = previousMode;
    }
    setJobState((prev) => ({ ...prev, status: 'idle' }));
  }, [dateEnd, dateStart, loadLatestResults, selectedCategories, useDateRange]);

  const isRunning = jobState.status === 'running' || jobState.status === 'starting';
  const showKillButton = jobState.status === 'running' || jobState.status === 'starting';
  const disableStart = isRunning || jobState.status === 'restarting';
  const completionInfo = jobState.status === 'finished'
    ? `Posledný zber: ${jobState.last_count ?? results.length} záznamov`
    : '';

  const handleHeaderPress = useCallback(() => {
    softResetUI({ skipNavigation: true });
  }, [softResetUI]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <TouchableOpacity
            onPress={handleHeaderPress}
            style={styles.headerTitleWrapper}
            activeOpacity={0.7}
          >
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              🔥 Inferno Scraper
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
              Lead finder pre reality.bazos.sk
            </Text>
          </TouchableOpacity>
          <View style={styles.statusWrapper}>
            <ServerStatus status={serverStatus} onWake={handleWakeServer} />
          </View>
          {showKillButton && (
            <TouchableOpacity onPress={cancelScrape} style={styles.killButton}>
              <Text style={styles.killButtonText}>❌ Zrušiť zber</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerIcons}>
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

          {(progress > 0 || progressLabel) && (
            <ProgressBar
              progress={progress}
              label={progressLabel}
              stageLabel={stageLabel}
            />
          )}

          {completionInfo ? (
            <Text style={styles.completionLabel}>{completionInfo}</Text>
          ) : null}

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
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    gap: 12,
  },
  headerTitleWrapper: {
    flexShrink: 1,
    minWidth: 0,
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
  statusWrapper: {
    flexShrink: 0,
  },
  killButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexShrink: 0,
  },
  killButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 12,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
    marginLeft: 16,
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
  completionLabel: {
    fontSize: 12,
    color: '#047857',
    marginTop: 4,
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
