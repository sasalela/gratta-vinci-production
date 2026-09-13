/**
 * Unico punto che decide i campi cliente effettivi di una campagna.
 * Usato dal backend (validazione play + risposta pubblica) e dai test.
 */

export type CustomerFieldKey =
  | 'name'
  | 'surname'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'marketingConsent';

export type CustomerField = {
  key: CustomerFieldKey;
  label: string;
  required: boolean;
  enabled: boolean;
};

export const DEFAULT_EMAIL_FIELD: CustomerField = {
  key: 'email',
  label: 'Email',
  required: true,
  enabled: true
};

/**
 * Campi effettivi:
 * - se `customerFields` ha voci → valgono quelle (nessuna email aggiunta di default)
 * - se vuoto o assente → email abilitata e obbligatoria
 */
export function resolveEffectiveCustomerFields(value: unknown): CustomerField[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...DEFAULT_EMAIL_FIELD }];
  }

  return value as CustomerField[];
}

/** Campi restituiti dall'endpoint pubblico campagna (già risolti). */
export function customerFieldsForPublicResponse(value: unknown): CustomerField[] {
  return resolveEffectiveCustomerFields(value);
}

/** Campi usati dal validatore della giocata. */
export function customerFieldsForPlayValidation(value: unknown): CustomerField[] {
  return resolveEffectiveCustomerFields(value);
}

export function validateCustomerData(
  fields: CustomerField[],
  customerData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  for (const field of fields) {
    if (!field.enabled || !field.required) {
      continue;
    }

    const raw = customerData[field.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors.push(`${field.label} is required`);
    }
  }

  return errors;
}
