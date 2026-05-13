const STORAGE_KEY = "customFoods";

export function getCustomFoods() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveCustomFoods(foods) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
}

export function addCustomFood(food) {
  const existing = getCustomFoods();
  existing.push(food);
  saveCustomFoods(existing);
  return existing;
}

export function removeCustomFood(id) {
  const existing = getCustomFoods();
  const filtered = existing.filter((f) => f.id !== id);
  saveCustomFoods(filtered);
  return filtered;
}
