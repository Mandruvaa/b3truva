export async function getItem<T>(_key: string): Promise<T | null> {
  console.warn('Storage local ainda não está implementado. Substitua por AsyncStorage, SecureStore ou outra camada de persistência.');
  return null;
}

export async function setItem<T>(_key: string, _value: T): Promise<void> {
  console.warn('Storage local ainda não está implementado. Substitua por AsyncStorage, SecureStore ou outra camada de persistência.');
}

export async function removeItem(_key: string): Promise<void> {
  console.warn('Storage local ainda não está implementado. Substitua por AsyncStorage, SecureStore ou outra camada de persistência.');
}
