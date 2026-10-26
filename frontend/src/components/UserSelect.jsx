import { useFetch } from '../hooks.js';
import { Field } from './ui.jsx';

/** Dropdown of active users of one role (uses the staff-only lookup endpoint). */
export default function UserSelect({ role, label, value, onChange, error, emptyLabel = 'Not assigned', roles }) {
  const { data } = useFetch('/users/lookup', role ? { role } : undefined);
  const list = (data || []).filter((u) => !roles || roles.includes(u.role));
  return (
    <Field as="select" label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={error}>
      <option value="">{emptyLabel}</option>
      {list.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
    </Field>
  );
}
