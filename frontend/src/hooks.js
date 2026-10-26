import { useCallback, useEffect, useRef, useState } from 'react';
import { api, readError } from './api/client.js';

/** Loads data from the API and exposes loading / error / reload. */
export function useFetch(url, params, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const key = JSON.stringify(params || {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await api.get(url, { params });
      if (my === seq.current) setState({ data: r.data.data, meta: r.data.meta || null, loading: false, error: null });
    } catch (e) {
      if (my === seq.current) setState({ data: null, meta: null, loading: false, error: readError(e).message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
