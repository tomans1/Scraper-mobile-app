import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { SecondaryButton } from './PrimaryButton';

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
  if (!visible) return null;

  const [startValue, setStartValue] = useState('');
  const [endValue, setEndValue] = useState('');

  useEffect(() => {
    setStartValue(dateStart ? formatDisplayDate(dateStart) : '');
    setEndValue(dateEnd ? formatDisplayDate(dateEnd) : '');
  }, [dateStart, dateEnd, visible]);

  const handleDateCommit = (value, onChange, fallback, setValue) => {
    const trimmed = value.trim();
    if (!trimmed) {
      onChange(null);
      setValue('');
      return;
    }

    const normalized = parseDateInput(trimmed);
    if (!normalized) {
      Alert.alert(
        'Neplatný dátum',
        'Použite formát DD/MM/YYYY alebo YYYY-MM-DD.'
      );
      setValue(fallback ? formatDisplayDate(fallback) : '');
      return;
    }

    onChange(normalized);
    setValue(formatDisplayDate(normalized));
  };

  const handleClearDates = () => {
    onDateStartChange(null);
    onDateEndChange(null);
    setStartValue('');
    setEndValue('');
  };

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
              Vyplňte oba dátumy vo formáte DD/MM/YYYY alebo YYYY-MM-DD.
            </Text>
            <View style={styles.dateInputsRow}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputLabel}>Od</Text>
                <TextInput
                  style={[styles.dateInput, newOnly && styles.dateInputDisabled]}
                  value={startValue}
                  onChangeText={setStartValue}
                  onEndEditing={(e) =>
                    handleDateCommit(
                      e.nativeEvent.text,
                      onDateStartChange,
                      dateStart,
                      setStartValue
                    )
                  }
                  placeholder="DD/MM/YYYY"
                  editable={!newOnly}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputLabel}>Do</Text>
                <TextInput
                  style={[styles.dateInput, newOnly && styles.dateInputDisabled]}
                  value={endValue}
                  onChangeText={setEndValue}
                  onEndEditing={(e) =>
                    handleDateCommit(
                      e.nativeEvent.text,
                      onDateEndChange,
                      dateEnd,
                      setEndValue
                    )
                  }
                  placeholder="DD/MM/YYYY"
                  editable={!newOnly}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                />
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
    </View>
  );
}

function formatDisplayDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-');
  const parts = normalized.split('-').filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }

  let year;
  let month;
  let day;

  if (parts[0].length === 4) {
    [year, month, day] = parts;
  } else {
    [day, month, year] = parts;
    if (year && year.length === 2) {
      year = `20${year}`;
    }
  }

  if (!year || !month || !day) {
    return null;
  }

  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);

  if (
    Number.isNaN(parsedYear) ||
    Number.isNaN(parsedMonth) ||
    Number.isNaN(parsedDay) ||
    parsedMonth < 1 ||
    parsedMonth > 12 ||
    parsedDay < 1 ||
    parsedDay > 31
  ) {
    return null;
  }

  const date = new Date(parsedYear, parsedMonth - 1, parsedDay);
  if (
    date.getFullYear() !== parsedYear ||
    date.getMonth() !== parsedMonth - 1 ||
    date.getDate() !== parsedDay
  ) {
    return null;
  }

  return `${parsedYear.toString().padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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
  dateInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1f2937',
  },
  dateInputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
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
});
