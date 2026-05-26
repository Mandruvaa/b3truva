import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from 'react-native-calendars';
import { KnownAsset, searchAssets } from '../data/knownAssets';
import { fetchAssetPrice } from '../api/quoteApi';

type Category = 'fiat' | 'crypto';
type Currency = 'BRL' | 'USD';
type Market = 'nacional' | 'estrangeiro';
type SortBy = 'data' | 'nome' | 'valor';

interface Asset {
  id: string;
  name: string;
  symbol: string;
  category: Category;
  currency: Currency;
  market: Market;
  quantity: number;
  purchasePrice: number;
  date: string;
}

const STORAGE_KEY = '@mandruva_invest_assets';
const EXCHANGE_RATE = 5.0;

function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const ASSET_EXAMPLES = {
  fiat: {
    BRL: { ticker: 'PETR4', name: 'Petrobras' },
    USD: { ticker: 'TSLA34', name: 'Tesla' },
  },
  crypto: {
    BRL: { ticker: 'BTC', name: 'Bitcoin' },
    USD: { ticker: 'ETH', name: 'Ethereum' },
  },
};

function formatBRL(value: number) {
  try {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch (e) {
    return `R$ ${value.toFixed(2)}`;
  }
}

function getValueInBRL(value: number, currency: Currency): number {
  return currency === 'USD' ? value * EXCHANGE_RATE : value;
}

function formatCurrency(value: number, currency: Currency) {
  if (currency === 'USD') {
    return `$ ${value.toFixed(2)}`;
  }
  return formatBRL(value);
}

function formatDate(dateString: string) {
  try {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
}

function getAssetExample(category: Category, currency: Currency) {
  return ASSET_EXAMPLES[category][currency];
}

function AssetItem({
  item,
  onEdit,
  onDelete,
}: {
  item: Asset;
  onEdit: (asset: Asset) => void;
  onDelete: (id: string) => void;
}) {
  const total = item.quantity * item.purchasePrice;
  const totalInBRL = getValueInBRL(total, item.currency);
  const conversionText =
    item.currency === 'USD'
      ? formatBRL(totalInBRL)
      : `$ ${(total / EXCHANGE_RATE).toFixed(2)}`;

  const marketLabel =
    item.category === 'crypto'
      ? null
      : item.market === 'nacional'
        ? '🇧🇷 Ibovespa'
        : '🌎 Nasdaq';

  return (
    <View style={styles.assetRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.assetNameRow}>
          <Text style={styles.assetName}>{item.name}</Text>
          {marketLabel && <Text style={styles.marketBadge}>{marketLabel}</Text>}
        </View>
        <Text style={styles.assetMeta}>
          {item.quantity} · {item.symbol}
        </Text>
        <Text style={styles.assetDate}>{formatDate(item.date)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
        <Text style={styles.assetTotal}>{formatCurrency(total, item.currency)}</Text>
        <Text style={styles.assetConversion}>{conversionText}</Text>
      </View>
      <View style={styles.assetActions}>
        <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionBtn}>
          <Text style={styles.actionText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Deletar', 'Tem certeza que deseja deletar este ativo?', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Deletar',
                onPress: () => onDelete(item.id),
                style: 'destructive',
              },
            ]);
          }}
          style={styles.actionBtn}
        >
          <Text style={styles.actionText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [monthYearVisible, setMonthYearVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getLocalDateString());
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [suggestions, setSuggestions] = useState<KnownAsset[]>([]);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('data');
  const [sortAsc, setSortAsc] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    market: '' as Market | '',
  });

  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    quantity: '',
    purchasePrice: '',
    category: 'crypto' as Category,
    currency: 'USD' as Currency,
    market: 'estrangeiro' as Market,
    date: getLocalDateString(),
  });

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setAssets(JSON.parse(data));
      }
    } catch (error) {
      console.error('Erro ao carregar ativos:', error);
    }
  };

  const saveAssets = async (newAssets: Asset[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAssets));
      setAssets(newAssets);
    } catch (error) {
      console.error('Erro ao salvar ativos:', error);
    }
  };

  const handleAddAsset = () => {
    if (
      !formData.name ||
      !formData.symbol ||
      !formData.quantity ||
      !formData.purchasePrice
    ) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    if (editingAsset) {
      const updatedAssets = assets.map((a) =>
        a.id === editingAsset.id
          ? {
              ...editingAsset,
              quantity: parseFloat(formData.quantity),
              purchasePrice: parseFloat(formData.purchasePrice),
              date: formData.date,
            }
          : a
      );
      saveAssets(updatedAssets);
      setEditingAsset(null);
    } else {
      const newAsset: Asset = {
        id: Date.now().toString(),
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        category: formData.category,
        currency: formData.currency,
        market: formData.market,
        quantity: parseFloat(formData.quantity),
        purchasePrice: parseFloat(formData.purchasePrice),
        date: formData.date,
      };

      const updatedAssets = [...assets, newAsset];
      saveAssets(updatedAssets);
    }

    resetForm();
    setModalVisible(false);
  };

  const resetForm = () => {
    const today = getLocalDateString();
    setFormData({
      name: '',
      symbol: '',
      quantity: '',
      purchasePrice: '',
      category: 'crypto',
      currency: 'USD',
      market: 'estrangeiro',
      date: today,
    });
    setEditingAsset(null);
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      symbol: asset.symbol,
      quantity: asset.quantity.toString(),
      purchasePrice: asset.purchasePrice.toString(),
      category: asset.category,
      currency: asset.currency,
      market: asset.market,
      date: asset.date,
    });
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    const updatedAssets = assets.filter((a) => a.id !== id);
    saveAssets(updatedAssets);
  };

  const getFilteredAssets = () => {
    let filtered = assets;

    if (filters.search) {
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          a.symbol.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.market) {
      filtered = filtered.filter((a) => a.market === filters.market);
    }

    // Aplicar ordenação
    let sorted = [...filtered];
    if (sortBy === 'data') {
      sorted.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortAsc ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === 'nome') {
      sorted.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return sortAsc ? cmp : -cmp;
      });
    } else if (sortBy === 'valor') {
      sorted.sort((a, b) => {
        const valueA = a.quantity * a.purchasePrice;
        const valueBRL_A = getValueInBRL(valueA, a.currency);
        const valueB = b.quantity * b.purchasePrice;
        const valueBRL_B = getValueInBRL(valueB, b.currency);
        return sortAsc ? valueBRL_A - valueBRL_B : valueBRL_B - valueBRL_A;
      });
    }

    return sorted;
  };

  const calculateBalance = (category?: Category, market?: Market) => {
    return assets
      .filter((a) => !category || a.category === category)
      .filter((a) => !market || a.market === market)
      .reduce((sum, asset) => {
        const total = asset.quantity * asset.purchasePrice;
        return sum + getValueInBRL(total, asset.currency);
      }, 0);
  };

  const totalBalance = calculateBalance();
  const fiatBalance = calculateBalance('fiat');
  const cryptoBalance = calculateBalance('crypto');
  const filteredAssets = getFilteredAssets();

  const example = getAssetExample(formData.category, formData.currency);
  const isEditing = editingAsset !== null;

  const currencySymbol = formData.currency === 'USD' ? '$' : 'R$';

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mandruva Invest</Text>

      <View style={styles.balanceContainer}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Geral</Text>
          <Text style={styles.balanceValue}>{formatBRL(totalBalance)}</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Fiat</Text>
          <Text style={styles.balanceValue}>{formatBRL(fiatBalance)}</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Cripto</Text>
          <Text style={styles.balanceValue}>{formatBRL(cryptoBalance)}</Text>
        </View>
      </View>

      <View style={styles.assetHeader}>
        <View style={styles.assetHeaderLeft}>
          <Text style={styles.sectionTitle}>Ativos</Text>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterVisible(!filterVisible)}
          >
            <Text style={styles.filterButtonText}>🔍</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setModalVisible(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Adicionar</Text>
        </TouchableOpacity>
      </View>

      {filterVisible && (
        <View style={styles.filterContainer}>
          <TextInput
            style={styles.filterInput}
            placeholder="Buscar por nome ou ticker..."
            placeholderTextColor="#666"
            value={filters.search}
            onChangeText={(text) => setFilters({ ...filters, search: text })}
          />

          <View style={styles.marketFilterContainer}>
            <TouchableOpacity
              style={[
                styles.marketFilterBtn,
                filters.market === '' && styles.marketFilterBtnActive,
              ]}
              onPress={() => setFilters({ ...filters, market: '' })}
            >
              <Text
                style={[
                  styles.marketFilterText,
                  filters.market === '' && styles.marketFilterTextActive,
                ]}
              >
                Todos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.marketFilterBtn,
                filters.market === 'nacional' && styles.marketFilterBtnActive,
              ]}
              onPress={() => setFilters({ ...filters, market: 'nacional' })}
            >
              <Text
                style={[
                  styles.marketFilterText,
                  filters.market === 'nacional' && styles.marketFilterTextActive,
                ]}
              >
                🇧🇷 Ibovespa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.marketFilterBtn,
                filters.market === 'estrangeiro' && styles.marketFilterBtnActive,
              ]}
              onPress={() => setFilters({ ...filters, market: 'estrangeiro' })}
            >
              <Text
                style={[
                  styles.marketFilterText,
                  filters.market === 'estrangeiro' && styles.marketFilterTextActive,
                ]}
              >
                🌎 Nasdaq
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sortContainer}>
            <Text style={styles.sortLabel}>Ordenar por:</Text>
            <View style={styles.sortButtons}>
              {(['data', 'nome', 'valor'] as SortBy[]).map((sort) => (
                <TouchableOpacity
                  key={sort}
                  style={[
                    styles.sortBtn,
                    sortBy === sort && styles.sortBtnActive,
                  ]}
                  onPress={() => {
                    if (sortBy === sort) {
                      setSortAsc(!sortAsc);
                    } else {
                      setSortBy(sort);
                      setSortAsc(false);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.sortBtnText,
                      sortBy === sort && styles.sortBtnTextActive,
                    ]}
                  >
                    {sort === 'data'
                      ? '📅 Data'
                      : sort === 'nome'
                        ? '📝 Nome'
                        : '💰 Valor'}
                    {sortBy === sort && (sortAsc ? ' ↑' : ' ↓')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={filteredAssets}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <AssetItem item={item} onEdit={handleEdit} onDelete={handleDelete} />
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum ativo encontrado</Text>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>
                {editingAsset ? 'Editar Ativo' : 'Adicionar Novo Ativo'}
              </Text>

              <Text style={styles.label}>Nome do Ativo</Text>
              <TextInput
                style={[styles.input, isEditing && styles.inputDisabled]}
                placeholder="Ex: Bitcoin"
                placeholderTextColor="#666"
                value={formData.name}
                onChangeText={(text) =>
                  !isEditing && setFormData({ ...formData, name: text })
                }
                editable={!isEditing}
              />

              <Text style={styles.label}>Código (Ticker)</Text>
              <TextInput
                style={[styles.input, isEditing && styles.inputDisabled]}
                placeholder={`Ex: ${example.ticker}`}
                placeholderTextColor="#666"
                value={formData.symbol}
                onChangeText={(text) =>
                  !isEditing && setFormData({ ...formData, symbol: text })
                }
                editable={!isEditing}
              />

              <Text style={styles.label}>Quantidade</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 0.254"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={formData.quantity}
                onChangeText={(text) =>
                  setFormData({ ...formData, quantity: text })
                }
              />

              <Text style={styles.label}>
                Preço de Compra ({currencySymbol})
              </Text>
              <TextInput
                style={styles.input}
                placeholder={`Ex: ${formData.currency === 'USD' ? '100.00' : '500.00'}`}
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={formData.purchasePrice}
                onChangeText={(text) =>
                  setFormData({ ...formData, purchasePrice: text })
                }
              />

              <Text style={styles.label}>Data de Obtenção</Text>
              <View style={styles.dateInputContainer}>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => {
                    setCalendarMonth(formData.date);
                    setCalendarVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <TextInput
                    style={styles.dateInputText}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor="#666"
                    value={
                      formData.date === getLocalDateString()
                        ? ''
                        : formatDate(formData.date)
                    }
                    onChangeText={(text) => {
                      if (text === '') {
                        const today = getLocalDateString();
                        setFormData({ ...formData, date: today });
                      } else {
                        // Permitir digitar livremente
                        // Tentar converter se tiver 10 caracteres
                        if (
                          text.length === 10 &&
                          text[2] === '/' &&
                          text[5] === '/'
                        ) {
                          const [day, month, year] = text.split('/');
                          const dateString = `${year}-${month}-${day}`;
                          setFormData({ ...formData, date: dateString });
                        }
                      }
                    }}
                    editable={
                      formData.date !== getLocalDateString()
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.todayCheckbox}
                  onPress={() => {
                    const today = getLocalDateString();
                    setFormData({ ...formData, date: today });
                    setCalendarVisible(false);
                  }}
                >
                  <Text style={styles.todayCheckboxText}>
                    {formData.date === getLocalDateString()
                      ? '✓'
                      : '○'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.todayLabel}>Hoje</Text>
              </View>

              {calendarVisible && (
                <Modal
                  animationType="fade"
                  transparent={true}
                  visible={true}
                  onRequestClose={() => setCalendarVisible(false)}
                >
                  <View style={styles.calendarOverlay}>
                    <View style={styles.calendarContainer}>
                      <View style={styles.calendarHeader}>
                        <Text style={styles.calendarTitle}>Selecionar Data</Text>
                        <TouchableOpacity
                          onPress={() => setCalendarVisible(false)}
                        >
                          <Text style={styles.calendarCloseBtn}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <Calendar
                        current={calendarMonth}
                        maxDate={getLocalDateString()}
                        onMonthChange={(month) => setCalendarMonth(month.dateString)}
                        renderHeader={(date) => {
                          const d = new Date(date.toString());
                          const mIdx = d.getMonth();
                          const yr = d.getFullYear();
                          return (
                            <TouchableOpacity
                              onPress={() => {
                                setPickerYear(yr);
                                setPickerMonth(mIdx);
                                setMonthYearVisible(true);
                              }}
                              style={{ paddingVertical: 8, paddingHorizontal: 16 }}
                            >
                              <Text style={{ color: '#e6eef8', fontSize: 16, fontWeight: '700' }}>
                                {MONTHS_PT[mIdx]} {yr} ▾
                              </Text>
                            </TouchableOpacity>
                          );
                        }}
                        onDayPress={(day) => {
                          setFormData({ ...formData, date: day.dateString });
                          setCalendarVisible(false);
                        }}
                        markedDates={{
                          [formData.date]: {
                            selected: true,
                            selectedColor: '#1a4a7a',
                          },
                        }}
                        theme={{
                          backgroundColor: '#0b1220',
                          calendarBackground: '#071028',
                          textSectionTitleColor: '#e6eef8',
                          textSectionTitleDisabledColor: '#7c8aa3',
                          selectedDayBackgroundColor: '#1a4a7a',
                          selectedDayTextColor: '#e6eef8',
                          todayTextColor: '#91d5ff',
                          dayTextColor: '#e6eef8',
                          textDisabledColor: '#7c8aa3',
                          dotColor: '#1a4a7a',
                          selectedDotColor: '#e6eef8',
                          arrowColor: '#1a4a7a',
                          disabledArrowColor: '#7c8aa3',
                          monthTextColor: '#e6eef8',
                          indicatorColor: '#1a4a7a',
                        }}
                      />
                      <TouchableOpacity
                        style={styles.calendarCloseButton}
                        onPress={() => setCalendarVisible(false)}
                      >
                        <Text style={styles.calendarCloseButtonText}>Fechar</Text>
                      </TouchableOpacity>

                      {monthYearVisible && (
                        <Modal
                          animationType="fade"
                          transparent={true}
                          visible={true}
                          onRequestClose={() => setMonthYearVisible(false)}
                        >
                          <View style={styles.calendarOverlay}>
                            <View style={styles.calendarContainer}>
                              <View style={styles.calendarHeader}>
                                <Text style={styles.calendarTitle}>Mês / Ano</Text>
                                <TouchableOpacity onPress={() => setMonthYearVisible(false)}>
                                  <Text style={styles.calendarCloseBtn}>✕</Text>
                                </TouchableOpacity>
                              </View>

                              <View style={styles.yearPickerRow}>
                                <TouchableOpacity
                                  onPress={() => setPickerYear((y) => y - 1)}
                                  style={styles.yearArrowBtn}
                                >
                                  <Text style={styles.yearArrowText}>‹</Text>
                                </TouchableOpacity>
                                <Text style={styles.yearText}>{pickerYear}</Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    const nowYear = new Date().getFullYear();
                                    if (pickerYear < nowYear) setPickerYear((y) => y + 1);
                                  }}
                                  style={styles.yearArrowBtn}
                                >
                                  <Text style={[
                                    styles.yearArrowText,
                                    pickerYear >= new Date().getFullYear() && styles.yearArrowDisabled,
                                  ]}>›</Text>
                                </TouchableOpacity>
                              </View>

                              <View style={styles.monthGrid}>
                                {MONTHS_PT.map((m, idx) => {
                                  const now = new Date();
                                  const isFuture =
                                    pickerYear > now.getFullYear() ||
                                    (pickerYear === now.getFullYear() && idx > now.getMonth());
                                  const isSelected = idx === pickerMonth;
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      disabled={isFuture}
                                      onPress={() => {
                                        const newMonth = `${pickerYear}-${String(idx + 1).padStart(2, '0')}-01`;
                                        setCalendarMonth(newMonth);
                                        setPickerMonth(idx);
                                        setMonthYearVisible(false);
                                      }}
                                      style={[
                                        styles.monthGridBtn,
                                        isSelected && styles.monthGridBtnActive,
                                        isFuture && styles.monthGridBtnDisabled,
                                      ]}
                                    >
                                      <Text style={[
                                        styles.monthGridText,
                                        isSelected && styles.monthGridTextActive,
                                        isFuture && styles.monthGridTextDisabled,
                                      ]}>
                                        {m}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              <TouchableOpacity
                                style={styles.calendarCloseButton}
                                onPress={() => setMonthYearVisible(false)}
                              >
                                <Text style={styles.calendarCloseButtonText}>Fechar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </Modal>
                      )}
                    </View>
                  </View>
                </Modal>
              )}

              {!isEditing && (
                <>
                  <Text style={styles.label}>Categoria</Text>
                  <View style={styles.typeContainer}>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        formData.category === 'crypto' &&
                          styles.typeButtonActive,
                      ]}
                      onPress={() =>
                        setFormData({ ...formData, category: 'crypto' })
                      }
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          formData.category === 'crypto' &&
                            styles.typeButtonTextActive,
                        ]}
                      >
                        Cripto
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        formData.category === 'fiat' && styles.typeButtonActive,
                      ]}
                      onPress={() =>
                        setFormData({ ...formData, category: 'fiat' })
                      }
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          formData.category === 'fiat' &&
                            styles.typeButtonTextActive,
                        ]}
                      >
                        Fiat
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Moeda de Origem</Text>
                  <View style={styles.typeContainer}>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        formData.currency === 'BRL' &&
                          styles.typeButtonActive,
                      ]}
                      onPress={() =>
                        setFormData({ ...formData, currency: 'BRL' })
                      }
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          formData.currency === 'BRL' &&
                            styles.typeButtonTextActive,
                        ]}
                      >
                        BRL
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        formData.currency === 'USD' &&
                          styles.typeButtonActive,
                      ]}
                      onPress={() =>
                        setFormData({ ...formData, currency: 'USD' })
                      }
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          formData.currency === 'USD' &&
                            styles.typeButtonTextActive,
                        ]}
                      >
                        USD
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {formData.category === 'fiat' && (
                    <>
                      <Text style={styles.label}>Mercado</Text>
                      <View style={styles.typeContainer}>
                        <TouchableOpacity
                          style={[
                            styles.typeButton,
                            formData.market === 'nacional' &&
                              styles.typeButtonActive,
                          ]}
                          onPress={() =>
                            setFormData({ ...formData, market: 'nacional' })
                          }
                        >
                          <Text
                            style={[
                              styles.typeButtonText,
                              formData.market === 'nacional' &&
                                styles.typeButtonTextActive,
                            ]}
                          >
                            🇧🇷 Ibovespa
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.typeButton,
                            formData.market === 'estrangeiro' &&
                              styles.typeButtonActive,
                          ]}
                          onPress={() =>
                            setFormData({ ...formData, market: 'estrangeiro' })
                          }
                        >
                          <Text
                            style={[
                              styles.typeButtonText,
                              formData.market === 'estrangeiro' &&
                                styles.typeButtonTextActive,
                            ]}
                          >
                            🌎 Nasdaq
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.buttonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleAddAsset}
                >
                  <Text style={styles.buttonText}>
                    {editingAsset ? 'Atualizar' : 'Salvar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0b1220',
    fontFamily: 'Helvetica',
  },
  header: {
    fontSize: 32,
    fontWeight: '700',
    color: '#e6eef8',
    marginBottom: 16,
    fontFamily: 'Helvetica',
  },
  balanceContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  balanceCard: {
    flex: 1,
    backgroundColor: '#071028',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  balanceLabel: {
    color: '#9fb4d9',
    fontSize: 11,
    marginBottom: 6,
    fontFamily: 'Helvetica',
  },
  balanceValue: {
    color: '#e6fff0',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Helvetica',
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  assetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    color: '#cfe8ff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  filterButton: {
    padding: 8,
  },
  filterButtonText: {
    fontSize: 18,
  },
  addButton: {
    backgroundColor: '#1a4a7a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#e6eef8',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  filterContainer: {
    backgroundColor: '#071028',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  filterInput: {
    backgroundColor: '#0b1220',
    borderRadius: 6,
    padding: 10,
    color: '#e6eef8',
    marginBottom: 10,
    borderColor: '#1a2a4a',
    borderWidth: 1,
    fontFamily: 'Helvetica',
  },
  marketFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  marketFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0b1220',
    borderColor: '#1a2a4a',
    borderWidth: 1,
    alignItems: 'center',
  },
  marketFilterBtnActive: {
    backgroundColor: '#1a4a7a',
    borderColor: '#1a4a7a',
  },
  marketFilterText: {
    color: '#9fb4d9',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  marketFilterTextActive: {
    color: '#e6eef8',
  },
  sortContainer: {
    borderTopWidth: 1,
    borderTopColor: '#1a2a4a',
    paddingTop: 10,
  },
  sortLabel: {
    color: '#9fb4d9',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: 'Helvetica',
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0b1220',
    borderColor: '#1a2a4a',
    borderWidth: 1,
    alignItems: 'center',
  },
  sortBtnActive: {
    backgroundColor: '#1a4a7a',
    borderColor: '#1a4a7a',
  },
  sortBtnText: {
    color: '#9fb4d9',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  sortBtnTextActive: {
    color: '#e6eef8',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#07122a',
    borderRadius: 10,
    marginBottom: 10,
  },
  assetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  assetName: {
    color: '#e6eef8',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  marketBadge: {
    color: '#91d5ff',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  assetMeta: {
    color: '#98a8c6',
    fontSize: 12,
    fontFamily: 'Helvetica',
  },
  assetDate: {
    color: '#7c8aa3',
    fontSize: 10,
    marginTop: 3,
    fontFamily: 'Helvetica',
  },
  assetTotal: {
    color: '#e6eef8',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  assetConversion: {
    color: '#9fb4d9',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'Helvetica',
  },
  assetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
  actionText: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#98a8c6',
    fontSize: 14,
    marginTop: 20,
    fontFamily: 'Helvetica',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: '90%',
  },
  modalTitle: {
    color: '#e6eef8',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    fontFamily: 'Helvetica',
  },
  label: {
    color: '#9fb4d9',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
    fontFamily: 'Helvetica',
  },
  input: {
    backgroundColor: '#071028',
    borderRadius: 8,
    padding: 12,
    color: '#e6eef8',
    borderColor: '#1a2a4a',
    borderWidth: 1,
    fontFamily: 'Helvetica',
  },
  inputDisabled: {
    backgroundColor: '#0a0f1a',
    color: '#7c8aa3',
    borderColor: '#0f1829',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  dateInput: {
    flex: 1,
    backgroundColor: '#071028',
    borderRadius: 8,
    borderColor: '#1a2a4a',
    borderWidth: 1,
  },
  dateInputText: {
    padding: 12,
    color: '#e6eef8',
    fontFamily: 'Helvetica',
  },
  todayCheckbox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#071028',
    borderColor: '#1a4a7a',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayCheckboxText: {
    color: '#1a4a7a',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Helvetica',
  },
  todayLabel: {
    color: '#9fb4d9',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: '#0b1220',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 500,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarTitle: {
    color: '#e6eef8',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Helvetica',
  },
  calendarCloseBtn: {
    color: '#9fb4d9',
    fontSize: 24,
    fontWeight: 'bold',
  },
  calendarCloseButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a4a7a',
    alignItems: 'center',
  },
  calendarCloseButtonText: {
    color: '#e6eef8',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  yearPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  yearArrowBtn: {
    padding: 8,
  },
  yearArrowText: {
    color: '#e6eef8',
    fontSize: 28,
    fontWeight: '700',
  },
  yearArrowDisabled: {
    color: '#2a3a5a',
  },
  yearText: {
    color: '#e6eef8',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Helvetica',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  monthGridBtn: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#071028',
    borderColor: '#1a2a4a',
    borderWidth: 1,
    alignItems: 'center',
  },
  monthGridBtnActive: {
    backgroundColor: '#1a4a7a',
    borderColor: '#1a4a7a',
  },
  monthGridBtnDisabled: {
    opacity: 0.25,
  },
  monthGridText: {
    color: '#9fb4d9',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  monthGridTextActive: {
    color: '#e6eef8',
  },
  monthGridTextDisabled: {
    color: '#4a5a7a',
  },
  dateButton: {
    backgroundColor: '#071028',
    borderRadius: 8,
    padding: 12,
    borderColor: '#1a4a7a',
    borderWidth: 1,
    alignItems: 'center',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#071028',
    borderColor: '#1a2a4a',
    borderWidth: 1,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#1a4a7a',
    borderColor: '#1a4a7a',
  },
  typeButtonText: {
    color: '#9fb4d9',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
  typeButtonTextActive: {
    color: '#e6eef8',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 30,
    marginBottom: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a2a4a',
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a4a7a',
    alignItems: 'center',
  },
  buttonText: {
    color: '#e6eef8',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Helvetica',
  },
});
