import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFile } from '../src/server/acquire.js';
import { routeContexts, applyRouteContext } from '../src/server/route-context.js';
import { templateFindings, addTemplateFindings } from '../src/server/template-flow.js';
import { snapshot } from './helpers.js';
import { investigateSource } from '../src/server/ai-source.js';

const template = (output: string, input = 'req.query.url') => ({
  ...snapshot(),
  files: [
    sourceFile(
      'routes.js',
      `exports.redirect = function(req, res) { res.render('redirect', { url: ${input} }); };`,
    ),
    sourceFile('views/redirect.ejs', output),
  ],
});

test('direct EJS rule links request and raw output; safe controls remain unflagged', () => {
  const input = template('<a href="<%- url %>">Continue</a>');
  const findings = templateFindings(input);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path[0].evidence?.path, 'routes.js');
  assert.equal(findings[0].evidence.path, 'views/redirect.ejs');
  assert.equal(templateFindings(template('<%= url %>')).length, 0);
  assert.equal(templateFindings(template('<%%- url %>')).length, 0);
  assert.equal(templateFindings(template('<%# example <%- url %>')).length, 0);
  assert.equal(templateFindings(template('<%- url -%>\n')).length, 1);
  assert.equal(templateFindings(template('<%- url _%>\n')).length, 1);
  assert.equal(templateFindings(template('<%- url %>', 'encode(req.query.url)')).length, 0);
  assert.equal(templateFindings(template('<%- url %>', '"constant"')).length, 0);
  addTemplateFindings(findings, input);
  assert.equal(findings.length, 1);
  const excluded = template('<%- url %>');
  excluded.files[0].path = 'tests/routes.js';
  assert.equal(templateFindings(excluded).length, 0);
});

test('AI outage retains independently detected template evidence', async () => {
  const result = await investigateSource(template('<%- url %>'), undefined, async () => {
    throw new Error('Provider unavailable');
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.findings.length, 1);
  assert.match(result.detail, /did not finish/);
});

test('session context resolves actual middleware body and leaves public and ambiguous guards alone', () => {
  const fixture = (condition: string, middleware = 'routes.gate, ') => ({
    ...snapshot(),
    files: [
      sourceFile(
        'app.js',
        `var routes = require('./routes');\napp.post('/save', ${middleware}routes.save);`,
      ),
      sourceFile(
        'routes/index.js',
        `exports.gate = function(req, res, next) {\nif (${condition}) { return next(); } else { return res.redirect('/'); }\n};\nexports.save = function(req, res) { res.render('edit', req.body); };`,
      ),
    ],
  });
  const protectedRoutes = routeContexts(fixture('req.session.loggedIn === 1'));
  assert.equal(protectedRoutes.length, 1);
  assert.equal(protectedRoutes[0].sessionChecks.length, 1);
  assert.equal(protectedRoutes[0].handler.line, 4);
  assert.equal(
    routeContexts(fixture('req.session.loggedIn || other === 1'))[0].sessionChecks.length,
    0,
  );
  assert.equal(routeContexts(fixture('req.session.loggedIn === 1', ''))[0].sessionChecks.length, 0);
  const finding = templateFindings(template('<%- url %>'))[0];
  finding.title = 'Unauthenticated render option injection';
  finding.summary = 'An unauthenticated caller can inject template options.';
  finding.evidence = { ...finding.evidence, path: 'routes/index.js', line: 4, endLine: 4 };
  applyRouteContext(finding, protectedRoutes);
  assert.match(finding.title, /unauthenticated/i);
  assert.equal(finding.routeContext![0].sessionChecks.length, 1);
  assert.equal(finding.routeContext![0].registration.path, 'app.js');
});

test('template rule skips overwritten locals, spreads and computed keys', () => {
  for (const suffix of [", url: 'fixed'", ', ...safeValues', ", [name]: 'fixed'"]) {
    assert.equal(templateFindings(template('<%- url %>', `req.query.url${suffix}`)).length, 0);
  }
});
