import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';
import { ChevronDown } from 'lucide-react-native';

export function FiltersDrawer({
  visible,
  availableFilters,
  selectedCategories,
  selectedCities,
  selectedZips,
  onToggleCategory,
  onToggleCity,
  onToggleZip,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  onNewOnly,
  newOnly,
  onApplyFilters,
  onClose,
}) {
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isSubcatDropdownOpen, setIsSubcatDropdownOpen] = useState(false);
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [zipSearchTerm, setZipSearchTerm] = useState('');
  const [tempStart, setTempStart] = useState(null);
  const [tempEnd, setTempEnd] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() =>
    getInitialMonth(dateStart, dateEnd)
  );

  const startValue = useMemo(
    () => (dateStart ? formatDisplayDate(dateStart) : ''),
    [dateStart]
  );
  const endValue = useMemo(
    () => (dateEnd ? formatDisplayDate(dateEnd) : ''),
    [dateEnd]
  );

  const filteredCities = useMemo(() => {
    if (!citySearchTerm) return availableFilters.cities;
    return availableFilters.cities.filter((city) =>
      city.toLowerCase().includes(citySearchTerm.toLowerCase())
    );
  }, [availableFilters.cities, citySearchTerm]);

  const filteredZips = useMemo(() => {
    if (!zipSearchTerm) return availableFilters.zips;
    return availableFilters.zips.filter((zip) =>
      zip.toLowerCase().includes(zipSearchTerm.toLowerCase())
    );
  }, [availableFilters.zips, zipSearchTerm]);

  useEffect(() => {
    if (!visible) {
      setIsCalendarVisible(false);
      setIsSubcatDropdownOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (isCalendarVisible) {
      setTempStart(dateStart);
      setTempEnd(dateEnd);
      setCurrentMonth(getInitialMonth(dateStart, dateEnd));
    }
  }, [isCalendarVisible, dateStart, dateEnd]);

  useEffect(() => {
    if (newOnly) {
      setIsCalendarVisible(false);
    }
  }, [newOnly]);

  const openCalendar = () => {
    if (newOnly) return;
    setTempStart(dateStart);
    setTempEnd(dateEnd);
    setCurrentMonth(getInitialMonth(dateStart, dateEnd));
    setIsCalendarVisible(true);
  };

  const handleDayPress = (dateString) => {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateString);
      setTempEnd(null);
      return;
    }

    if (dateString < tempStart) {
      setTempStart(dateString);
      setTempEnd(null);
      return;
    }

    setTempEnd(dateString);
  };

  const handleConfirmRange = () => {
    if (!tempStart || !tempEnd) return;
    onDateStartChange(tempStart);
    onDateEndChange(tempEnd);
    setIsCalendarVisible(false);
  };

  const handleCancelRange = () => {
    setIsCalendarVisible(false);
  };

  const handleClearDates = () => {
    onDateStartChange(null);
    onDateEndChange(null);
    setTempStart(null);
    setTempEnd(null);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => shiftMonth(prev, -1));
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => shiftMonth(prev, 1));
  };

  const monthDays = useMemo(
    () => generateMonthDays(currentMonth.year, currentMonth.month),
    [currentMonth]
  );
  const monthLabel = formatMonthLabel(currentMonth.year, currentMonth.month);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.drawer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filtre</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.label}>Podkategorie:</Text>
            <Pressable
              style={styles.dropdownToggle}
              onPress={() => setIsSubcatDropdownOpen(!isSubcatDropdownOpen)}
            >
              <Text style={styles.dropdownText}>
                {selectedCategories.length > 0
                  ? `Vybrane: ${selectedCategories.length}`
                  : 'Vyberte podkategorie'}
              </Text>
              <ChevronDown size={20} color="#6b7280" />
            </Pressable>

            {isSubcatDropdownOpen && (
              <View style={styles.dropdownOptions}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                  {availableFilters.subcategories.map((cat) => (
                    <Pressable
                      key={cat}
                      style={styles.checkboxRow}
                      onPress={() => onToggleCategory(cat)}
                    >
                      <View style={styles.checkbox}>
                        {selectedCategories.includes(cat) && (
                          <View style={styles.checkboxChecked} />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{cat}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Mesta:</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Hladat mesto..."
              value={citySearchTerm}
              onChangeText={setCitySearchTerm}
            />
            <ScrollView style={styles.filterList} nestedScrollEnabled>
              {filteredCities.map((city) => (
                <Pressable
                  key={city}
                  style={styles.checkboxRow}
                  onPress={() => onToggleCity(city)}
                >
                  <View style={styles.checkbox}>
                    {selectedCities.includes(city) && (
                      <View style={styles.checkboxChecked} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>{city}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedCities.length > 0 && (
              <Text style={styles.selectionHint}>
                {selectedCities.length === 1
                  ? 'Vybrana 1 polozka'
                  : `Vybranych ${selectedCities.length} poloziek`}
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>PSC:</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Hladat PSC..."
              value={zipSearchTerm}
              onChangeText={setZipSearchTerm}
            />
            <ScrollView style={styles.filterList} nestedScrollEnabled>
              {filteredZips.map((zip) => (
                <Pressable
                  key={zip}
                  style={styles.checkboxRow}
                  onPress={() => onToggleZip(zip)}
                >
                  <View style={styles.checkbox}>
                    {selectedZips.includes(zip) && (
                      <View style={styles.checkboxChecked} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>{zip}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedZips.length > 0 && (
              <Text style={styles.selectionHint}>
                {selectedZips.length === 1
                  ? 'Vybrana 1 polozka'
                  : `Vybranych ${selectedZips.length} poloziek`}
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.newOnlyRow}>
              <Text style={styles.label}>Iba nove inzeraty</Text>
              <Switch value={newOnly} onValueChange={onNewOnly} />
            </View>
            <Text style={styles.helperText}>
              Ak je zapnute, zobrazia sa len najnovsie inzeraty a rozsah datumov
              sa nepouzije.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Datum pridania inzeratu</Text>
            <View style={styles.dateInputsRow}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputLabel}>Od</Text>
                <Pressable
                  onPress={openCalendar}
                  disabled={newOnly}
                  style={[
                    styles.dateDisplay,
                    newOnly && styles.dateInputDisabled,
                    startValue && styles.dateDisplaySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateDisplayText,
                      newOnly && styles.dateDisplayTextDisabled,
                      startValue && styles.dateDisplayTextSelected,
                    ]}
                  >
                    {startValue || 'DD/MM/YYYY'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputLabel}>Do</Text>
                <Pressable
                  onPress={openCalendar}
                  disabled={newOnly}
                  style={[
                    styles.dateDisplay,
                    newOnly && styles.dateInputDisabled,
                    endValue && styles.dateDisplaySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateDisplayText,
                      newOnly && styles.dateDisplayTextDisabled,
                      endValue && styles.dateDisplayTextSelected,
                    ]}
                  >
                    {endValue || 'DD/MM/YYYY'}
                  </Text>
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={handleClearDates}
              disabled={newOnly || (!dateStart && !dateEnd)}
              style={[styles.clearButton, (newOnly || (!dateStart && !dateEnd)) && styles.clearButtonDisabled]}
            >
              <Text
                style={[styles.clearButtonText, (newOnly || (!dateStart && !dateEnd)) && styles.clearButtonTextDisabled]}
              >
                Vymazat datumy
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton title="Zavriet" onPress={onClose} />
        </View>
      </View>

      <Modal
        visible={isCalendarVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRange}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={goToPreviousMonth} style={styles.calendarNavButton}>
                <Text style={styles.calendarNavText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarHeaderTitle}>{monthLabel}</Text>
              <Pressable onPress={goToNextMonth} style={styles.calendarNavButton}>
                <Text style={styles.calendarNavText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEK_DAYS.map((day) => (
                <Text key={day} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {monthDays.map((day) => {
                const dateString = day.dateString;
                const isStart = tempStart && dateString === tempStart;
                const isEnd = tempEnd && dateString === tempEnd;
                const hasBoth = tempStart && tempEnd;
                const isInRange =
                  tempStart &&
                  (!tempEnd
                    ? dateString === tempStart
                    : dateString >= tempStart && dateString <= tempEnd);
                const isMiddle = hasBoth && isInRange && !isStart && !isEnd;

                return (
                  <Pressable
                    key={day.key}
                    disabled={!day.inMonth}
                    onPress={() => handleDayPress(dateString)}
                    style={[
                      styles.dayCell,
                      !day.inMonth && styles.dayCellMuted,
                      isInRange && styles.dayCellInRange,
                      isMiddle && styles.dayCellMiddle,
                      isStart && styles.dayCellStart,
                      isEnd && styles.dayCellEnd,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        !day.inMonth && styles.dayCellTextMuted,
                        isInRange && styles.dayCellTextInRange,
                        (isStart || isEnd) && styles.dayCellTextSelected,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarActions}>
              <SecondaryButton
                title="Zrusit"
                onPress={handleCancelRange}
                style={styles.calendarActionButton}
              />
              <PrimaryButton
                title="Potvrdit"
                onPress={handleConfirmRange}
                disabled={!tempStart || !tempEnd}
                style={[
                  styles.calendarActionButton,
                  (!tempStart || !tempEnd) && styles.confirmDisabled,
                ]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDisplayDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

const WEEK_DAYS = ['Po', 'Ut', 'St', 'St', 'Pi', 'So', 'Ne'];
const MONTH_NAMES = [
  'januar',
  'februar',
  'marec',
  'april',
  'maj',
  'jun',
  'jul',
  'august',
  'september',
  'oktober',
  'november',
  'december',
];

function formatMonthLabel(year, month) {
  const safeMonth = Math.min(Math.max(month, 0), 11);
  return `${MONTH_NAMES[safeMonth]} ${year}`;
}

function pad(number) {
  return number.toString().padStart(2, '0');
}

function formatISODate(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function generateMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = 42;
  const days = [];
  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - startOffset + 1;
    const date = new Date(year, month, dayOffset);
    const inMonth = date.getMonth() === month;
    const dateString = formatISODate(date);
    days.push({
      key: `${dateString}-${index}`,
      label: String(date.getDate()),
      dateString,
      inMonth,
    });
  }
  return days;
}

function getInitialMonth(start, end) {
  const base = start || end || formatISODate(new Date());
  if (!base) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }
  const [year, month] = base.split('-');
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  if (Number.isNaN(parsedYear) || Number.isNaN(parsedMonth)) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }
  return { year: parsedYear, month: parsedMonth - 1 };
}

function shiftMonth(current, delta) {
  const date = new Date(current.year, current.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 24,
    color: '#6b7280',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1f2937',
  },
  dropdownToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  dropdownText: {
    fontSize: 14,
    color: '#1f2937',
  },
  dropdownOptions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    maxHeight: 200,
    backgroundColor: '#fff',
  },
  dropdownScroll: {
    padding: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  filterList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#f9fafb',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  selectionHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  newOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 4,
  },
  dateDisplay: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dateDisplaySelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  dateDisplayText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  dateDisplayTextSelected: {
    color: '#1f2937',
    fontWeight: '600',
  },
  dateDisplayTextDisabled: {
    color: '#d1d5db',
  },
  dateInputDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.7,
  },
  clearButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  clearButtonTextDisabled: {
    color: '#6b7280',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarNavButton: {
    padding: 8,
  },
  calendarNavText: {
    fontSize: 20,
    color: '#1f2937',
  },
  calendarHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -2,
  },
  dayCell: {
    width: `${100 / 7}%`,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellInRange: {
    backgroundColor: '#dbeafe',
  },
  dayCellMiddle: {
    borderRadius: 12,
  },
  dayCellStart: {
    backgroundColor: '#3b82f6',
  },
  dayCellEnd: {
    backgroundColor: '#3b82f6',
  },
  dayCellMuted: {
    opacity: 0.4,
  },
  dayCellText: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '500',
  },
  dayCellTextInRange: {
    color: '#1d4ed8',
  },
  dayCellTextMuted: {
    color: '#6b7280',
  },
  dayCellTextSelected: {
    color: '#fff',
  },
  calendarActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  calendarActionButton: {
    flex: 1,
  },
  confirmDisabled: {
    backgroundColor: '#d1d5db',
  },
});
