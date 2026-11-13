import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFile } from '../src/server/acquire.js';
import { investigateSource } from '../src/server/ai-source.js';
import { researchThreats } from '../src/server/threat-research.js';
import { snapshot } from './helpers.js';

test(
  'paid API provider reviews PHP and records live web research with a request allowance',
  { timeout: 330000 },
  async () => {
    assert.equal(process.env.TRACE_AI_PROVIDER, 'openai', 'Explicit paid-provider opt-in required');
    const source = await investigateSource({
      ...snapshot(),
      files: [
        sourceFile(
          'index.php',
          '<?php\n// Public HTTP handler; intentionally unsafe test fixture.\necho $_GET["name"];',
        ),
      ],
    });
    assert.ok(
      source.findings.length > 0,
      'Expected the explicit unescaped-output fixture to be identified',
    );
    assert.ok(
      source.findings.every((f) => f.assurance === 'potential' && f.evidence.path === 'index.php'),
    );
    const research = await researchThreats({
      ...snapshot(),
      files: [sourceFile('Dockerfile', 'FROM php:8.3.35-fpm')],
    });
    assert.ok(['complete', 'partial'].includes(research.status));
    assert.ok(
      research.findings.length > 0,
      'Expected a published PHP advisory relevant to this version',
    );
    assert.ok(research.findings.every((f) => f.references.length && f.intelligence?.checkedAt));
    console.log(
      JSON.stringify(
        {
          source: source.detail,
          research: research.detail,
          reports: research.findings.map((f) => ({
            title: f.title,
            rule: f.rule,
            intelligence: f.intelligence,
          })),
        },
        null,
        2,
      ),
    );
  },
);
