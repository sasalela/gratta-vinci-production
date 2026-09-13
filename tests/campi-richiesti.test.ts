import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customerFieldsForPlayValidation,
  customerFieldsForPublicResponse,
  resolveEffectiveCustomerFields,
  validateCustomerData,
  type CustomerField
} from '../lib/customer-fields';

const NAME_EMAIL_FIELDS: CustomerField[] = [
  { key: 'name', label: 'Nome', required: true, enabled: true },
  { key: 'email', label: 'Email', required: true, enabled: true }
];

const EXPECTED_DEFAULT_EMAIL: CustomerField[] = [
  { key: 'email', label: 'Email', required: true, enabled: true }
];

/** Stessa porta usata da /api/public/play dopo la risoluzione campi. */
function playAccepted(
  rawCustomerFields: unknown,
  customerData: Record<string, unknown>
): boolean {
  const fields = customerFieldsForPlayValidation(rawCustomerFields);
  return validateCustomerData(fields, customerData).length === 0;
}

describe('campi richiesti effettivi', () => {
  it('customerFields vuoto → campi effettivi = email obbligatoria', () => {
    assert.deepEqual(resolveEffectiveCustomerFields([]), EXPECTED_DEFAULT_EMAIL);
    assert.deepEqual(resolveEffectiveCustomerFields(null), EXPECTED_DEFAULT_EMAIL);
    assert.deepEqual(resolveEffectiveCustomerFields(undefined), EXPECTED_DEFAULT_EMAIL);
  });

  it('customerFields vuoto: giocata senza email rifiutata, con email accettata', () => {
    assert.equal(playAccepted([], {}), false);
    assert.equal(playAccepted([], { email: '' }), false);
    assert.equal(playAccepted([], { email: '   ' }), false);
    assert.equal(playAccepted([], { email: 'giocatore@test.it' }), true);
    assert.equal(playAccepted(null, { name: 'Solo Nome' }), false);
  });

  it('customerFields popolato: valgono le voci, email non duplicata', () => {
    const effective = resolveEffectiveCustomerFields(NAME_EMAIL_FIELDS);
    assert.deepEqual(effective, NAME_EMAIL_FIELDS);
    assert.equal(effective.filter((f) => f.key === 'email').length, 1);

    const onlyName: CustomerField[] = [
      { key: 'name', label: 'Nome', required: true, enabled: true }
    ];
    const withoutForcedEmail = resolveEffectiveCustomerFields(onlyName);
    assert.deepEqual(withoutForcedEmail, onlyName);
    assert.equal(withoutForcedEmail.some((f) => f.key === 'email'), false);
    assert.equal(playAccepted(onlyName, { name: 'Anna' }), true);
    assert.equal(playAccepted(onlyName, {}), false);
  });

  it('endpoint pubblico e validatore play restituiscono gli stessi campi effettivi', () => {
    const cases: unknown[] = [
      [],
      null,
      undefined,
      NAME_EMAIL_FIELDS,
      [{ key: 'phone', label: 'Telefono', required: false, enabled: true }]
    ];

    for (const raw of cases) {
      const fromPublic = customerFieldsForPublicResponse(raw);
      const fromPlay = customerFieldsForPlayValidation(raw);
      assert.deepEqual(
        fromPublic,
        fromPlay,
        `divergenza campi pubblici vs validatore per ${JSON.stringify(raw)}`
      );
      assert.deepEqual(fromPublic, resolveEffectiveCustomerFields(raw));
    }
  });
});
