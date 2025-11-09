import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  Modal,
} from 'react-native';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';

export function FiltersDrawer({
  visible,
  categories,
  selectedCategories,
  onToggleCategory,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  onNewOnly,
  newOnly,
  onClose,
}) {
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
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

  useEffect(() => {
    if (!visible) {
      setIsCalendarVisible(false);
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
            <Text style={styles.label}>Podkategórie:</Text>
            <View style={styles.categoriesGrid}>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryItem,
                    selectedCategories.includes(cat) && styles.categoryItemSelected,
                  ]}
                  onPress={() => onToggleCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategories.includes(cat) && styles.categoryTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.newOnlyRow}>
              <Text style={styles.label}>Iba nové inzeráty</Text>
              <Switch value={newOnly} onValueChange={onNewOnly} />
            </View>
            <Text style={styles.helperText}>
              Ak je zapnuté, zobrazia sa len najnovšie inzeráty a rozsah dátumov
              sa nepoužije.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Dátum pridania inzerátu</Text>
            <Text style={styles.helperText}>
              Vyberte dátumy z kalendára a označte rozsah, ktorý chcete použiť.
            </Text>
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
                Vymazať dátumy
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton title="Zavrieť" onPress={onClose} />
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
                title="Zrušiť"
                onPress={handleCancelRange}
                style={styles.calendarActionButton}
              />
              <PrimaryButton
                title="Potvrdiť"
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

const WEEK_DAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const MONTH_NAMES = [
  'január',
  'február',
  'marec',
  'apríl',
  'máj',
  'jún',
  'júl',
  'august',
  'september',
  'október',
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
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday as first day
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
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flex: 1,
    minWidth: '45%',
  },
  categoryItemSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryText: {
    fontSize: 13,
    color: '#1f2937',
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: '#fff',
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
