import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fmtRatio, ratioTitle } from '../renderer/ts/table/format';

describe('fmtRatio', () => {
    it('keeps 2 decimals below 100', () => {
        assert.equal(fmtRatio(0), '0.00');
        assert.equal(fmtRatio(11.67), '11.67');
        assert.equal(fmtRatio(99.994), '99.99');
    });

    it('drops decimals as values grow', () => {
        assert.equal(fmtRatio(100), '100.0');
        assert.equal(fmtRatio(123.456), '123.5');
        assert.equal(fmtRatio(1234.4), '1234');
        assert.equal(fmtRatio(9999.4), '9999');
    });

    it('picks the precision from the rounded value', () => {
        assert.equal(fmtRatio(99.996), '100.0');
        assert.equal(fmtRatio(999.96), '1000');
        assert.equal(fmtRatio(999.94), '999.9');
        assert.equal(fmtRatio(9999.6), '10.0k');
    });

    it('uses the k form from 10000', () => {
        assert.equal(fmtRatio(12_345), '12.3k');
        assert.equal(fmtRatio(250_000), '250k');
    });

    it('shows a dash for missing values', () => {
        assert.equal(fmtRatio(undefined), '—');
    });
});

describe('ratioTitle', () => {
    it('gives the exact value only when the text was compacted', () => {
        assert.equal(ratioTitle(11.67), null);
        assert.equal(ratioTitle(undefined), null);
        assert.equal(ratioTitle(123.456), '123.46');
        assert.equal(ratioTitle(99.996), '100.00');
        assert.equal(ratioTitle(99.99), null);
    });
});
