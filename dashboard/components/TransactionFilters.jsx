export default function TransactionFilters({ filters }) {
  return (
    <form className="inline-filters" action="/transactions">
      <input type="hidden" name="userId" value={filters.userId || ''} />
      <input type="hidden" name="month" value={filters.month || ''} />

      <label>
        <span>Status</span>
        <select name="status" defaultValue={filters.status || ''}>
          <option value="">All</option>
          <option value="confirmed">Confirmed</option>
          <option value="needs_review">Needs review</option>
          <option value="duplicate">Duplicate</option>
          <option value="ignored">Ignored</option>
        </select>
      </label>

      <label>
        <span>Category code</span>
        <input name="category" defaultValue={filters.category || ''} placeholder="food, transfer, utility" />
      </label>

      <label className="search-filter">
        <span>Search</span>
        <input name="search" defaultValue={filters.search || ''} placeholder="shop, ref, description" />
      </label>

      <button type="submit">Filter</button>
    </form>
  );
}
