function comparable(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase();
}

export function filterItems(data, filters = {}) {
  const query = comparable(filters.query).trim();
  const tagMap = new Map(data.tags.map((tag) => [tag.id, tag.name]));
  return [...data.items]
    .filter((item) => {
      if (filters.typeId && item.typeId !== filters.typeId) return false;
      if (filters.favorite && !item.favorite) return false;
      if (filters.tagId && !item.tagIds.includes(filters.tagId)) return false;
      if (!query) return true;
      const haystack = comparable([
        item.title,
        item.description,
        item.url,
        ...item.tagIds.map((id) => tagMap.get(id) || "")
      ].join(" "));
      return query.split(/\s+/u).every((term) => haystack.includes(term));
    })
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
