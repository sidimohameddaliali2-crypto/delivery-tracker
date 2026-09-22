import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Supy's public API has no server-side "search by name" filter for recipes
// (only category/state/type/date/location), so we pull every available
// recipe once and search in memory. Refreshed on a TTL rather than per
// request since the retailer's recipe list changes rarely.
const CACHE_TTL_MS = 10 * 60 * 1000;
// Kick off a background refresh this long before the cache would actually go
// stale, so a real user's search almost never pays for the ~2500-recipe,
// 5-page fetch (each page fetched concurrently, but a cold fetch is still
// the slowest single page's round trip + overhead — worth avoiding).
const REFRESH_AHEAD_MS = 60 * 1000;

let recipeCache = { data: [], fetchedAt: 0 };
let inFlightFetch = null;

const normalizeRecipe = (recipe) => ({
  id: recipe.id,
  code: recipe.code || '',
  name: recipe.name?.en || recipe.nameEn || '',
  category: recipe.category?.name || recipe.categoryName || '',
  type: recipe.type || '',
  portionSize: recipe.portionSize ?? null,
  portionBaseUom: recipe.portionBaseUom || '',
  ingredients: (recipe.ingredients || []).map((ing) => ({
    name: ing.name,
    netQuantity: ing.netQuantity,
    uom: ing.uom
  }))
});

class SupyService {
  constructor() {
    this.baseURL = process.env.SUPY_API_BASE_URL || 'https://api.retailer.supy.io/api/public';
    this.apiKey = process.env.SUPY_API_KEY;
  }

  client() {
    if (!this.apiKey) {
      throw new Error('Supy API is not configured (missing SUPY_API_KEY)');
    }

    return axios.create({
      baseURL: this.baseURL,
      headers: { 'x-api-key': this.apiKey, 'x-version': 3 },
      timeout: 20000
    });
  }

  async fetchRecipesPage(offset, limit) {
    const response = await this.client().get('/recipes', {
      params: {
        filtering: JSON.stringify({
          condition: 'and',
          filtering: [{ by: 'state', op: 'in', match: ['available'] }],
          groups: []
        }),
        paging: JSON.stringify({ offset, limit })
      }
    });
    return {
      batch: response.data?.data || [],
      total: response.data?.metadata?.total ?? 0
    };
  }

  /**
   * Fetches every available recipe. The retailer has ~2500 recipes, so this
   * is several hundred-KB of JSON across multiple pages — fetched
   * concurrently (after learning the total from page 1) rather than one
   * page at a time, since a sequential fetch measured ~20s cold, which is
   * long enough that a mid-flight page-1 result silently looked like "no
   * matches" once the query resolved after the user had already given up.
   */
  async fetchAllRecipes() {
    const limit = 500;
    const first = await this.fetchRecipesPage(0, limit);
    const pages = [first.batch];

    const remainingOffsets = [];
    for (let offset = limit; offset < first.total; offset += limit) {
      remainingOffsets.push(offset);
    }

    if (remainingOffsets.length > 0) {
      const rest = await Promise.all(remainingOffsets.map((offset) => this.fetchRecipesPage(offset, limit)));
      rest.forEach((page) => pages.push(page.batch));
    }

    return pages.flat().map(normalizeRecipe);
  }

  /** Populates the cache, coalescing concurrent callers onto one fetch. */
  async refreshCache() {
    if (!inFlightFetch) {
      inFlightFetch = this.fetchAllRecipes()
        .then((data) => {
          recipeCache = { data, fetchedAt: Date.now() };
          return data;
        })
        .finally(() => {
          inFlightFetch = null;
        });
    }
    return inFlightFetch;
  }

  async getCachedRecipes() {
    const age = Date.now() - recipeCache.fetchedAt;

    if (recipeCache.data.length === 0 || age > CACHE_TTL_MS) {
      // Cold or expired — callers need to wait for real data.
      return this.refreshCache();
    }

    if (age > CACHE_TTL_MS - REFRESH_AHEAD_MS && !inFlightFetch) {
      // Getting stale — refresh in the background, serve what we have now.
      this.refreshCache().catch((err) => console.error('Supy recipe cache background refresh failed:', err.message));
    }

    return recipeCache.data;
  }

  /** Best-effort cache warm-up — call once at server startup so the first real search isn't the one paying for a cold fetch. */
  warmCache() {
    if (!this.apiKey) return;
    this.refreshCache().catch((err) => console.error('Supy recipe cache warm-up failed:', err.message));
  }

  async searchRecipes(query, { limit = 20 } = {}) {
    const recipes = await this.getCachedRecipes();
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    const startsWith = [];
    const includes = [];
    for (const recipe of recipes) {
      const name = recipe.name.toLowerCase();
      if (!name) continue;
      if (name.startsWith(q)) startsWith.push(recipe);
      else if (name.includes(q)) includes.push(recipe);
    }

    return [...startsWith, ...includes].slice(0, limit);
  }
}

export default new SupyService();
