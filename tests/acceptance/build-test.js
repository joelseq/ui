import { test } from 'qunit';
import moduleForAcceptance from 'screwdriver-ui/tests/helpers/module-for-acceptance';
import { authenticateSession } from 'screwdriver-ui/tests/helpers/ember-simple-auth';
import Pretender from 'pretender';
let server;

moduleForAcceptance('Acceptance | build', {
  beforeEach() {
    server = new Pretender();

    server.get('http://localhost:8080/v4/pipelines/abcd', () => [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        id: 'abcd',
        scmUrl: 'git@github.com:foo/bar.git#master',
        createTime: '2016-09-15T23:12:23.760Z',
        admins: { batman: true },
        workflow: ['main', 'publish', 'prod']
      })
    ]);

    server.get('http://localhost:8080/v4/builds/1234', () => [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        id: '1234',
        jobId: 'aabbcc',
        number: 1474649580274,
        container: 'node:6',
        cause: 'Started by user petey',
        sha: 'c96f36886e084d18bd068b8156d095cd9b31e1d6',
        createTime: '2016-09-23T16:53:00.274Z',
        startTime: '2016-09-23T16:53:08.601Z',
        endTime: '2016-09-23T16:58:47.355Z',
        meta: {},
        steps: [{
          startTime: '2016-09-23T16:53:07.497654442Z',
          name: 'sd-setup',
          code: 0,
          endTime: '2016-09-23T16:53:12.46806858Z'
        }, {
          startTime: '2016-09-23T16:53:12.902784483Z',
          name: 'install',
          code: 137,
          endTime: '2016-09-23T16:58:46.924844475Z'
        }, {
          name: 'bower'
        }, {
          name: 'test'
        }],
        status: 'FAILURE'
      })
    ]);

    server.get('http://localhost:8080/v4/jobs/aabbcc', () => [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        id: 'aabbcc',
        name: 'PR-50',
        permutations: [{
          environment: {},
          secrets: [],
          commands: [{
            name: 'install',
            command: 'npm install'
          }, {
            name: 'bower',
            command: 'npm install bower && ./node_modules/.bin/bower install --allow-root'
          }, {
            name: 'test',
            command: 'npm test'
          }],
          image: 'node:6'
        }],
        pipelineId: '34b6834028c4c904dce3d9391c8b2dd4994ec6a9',
        state: 'ENABLED',
        archived: false
      })
    ]);

    server.get('http://localhost:8080/v4/builds/1234/steps/install/logs', () => [
      200,
      { 'Content-Type': 'application/json', 'x-more-data': 'false' },
      JSON.stringify([{ t: 1474649593036, m: 'bad stuff', n: 0 }])
    ]);

    server.get('http://localhost:8080/v4/builds/1234/steps/sd-setup/logs', () => [
      200,
      { 'Content-Type': 'application/json', 'x-more-data': 'false' },
      JSON.stringify([{ t: 1474649593036, m: 'fancy stuff', n: 0 }])
    ]);
  },
  afterEach() {
    server.shutdown();
  }
});

test('visiting /pipelines/:id/build/:id', function (assert) {
  visit('/pipelines/abcd/build/1234');

  andThen(() => {
    assert.equal(currentURL(), '/pipelines/abcd/build/1234');
    assert.equal(find('a h1').text().trim(), 'foo:bar', 'incorrect pipeline name');
    assert.equal(find('.line1 h1').text().trim(), 'PR-50', 'incorrect job name');
    assert.equal(find('span.sha').text().trim(), '#c96f36', 'incorrect sha');
    assert.equal(find('.is-open .logs').text().trim(), 'bad stuff', 'incorrect logs open');
  });

  click('.build-step-collection > div:nth-child(3) .name');
  click('.build-step-collection > div:nth-child(2) .name');

  andThen(() => {
    assert.equal(find('.is-open .logs').text().trim(), 'fancy stuff', 'incorrect logs open');
  });
});

test('can restart a build when authenticated, and reload a queued build periodically',
function (assert) {
  authenticateSession(this.application, { token: 'faketoken' });
  let count = -1;

  server.get('http://localhost:8080/v4/builds/5678', () => {
    count += 1;

    return [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        id: '5678',
        jobId: 'aabbcc',
        number: 1474649580274,
        container: 'node:6',
        cause: 'Started by user petey',
        sha: 'c96f36886e084d18bd068b8156d095cd9b31e1d6',
        createTime: '2016-09-23T16:53:00.274Z',
        startTime: '2016-09-23T16:53:08.601Z',
        meta: {},
        steps: [{
          name: 'sd-setup'
        }, {
          name: 'install'
        }, {
          name: 'bower'
        }, {
          name: 'test'
        }],
        status: ['RUNNING', 'SUCCESS'][count]
      })
    ];
  });

  server.post('http://localhost:8080/v4/builds', () => [
    200,
    { 'Content-Type': 'application/json' },
    JSON.stringify({
      id: '5678',
      status: 'QUEUED'
    })
  ]);

  visit('/pipelines/abcd/build/1234');

  andThen(() => {
    assert.equal(currentURL(), '/pipelines/abcd/build/1234');
    assert.equal(find('a h1').text().trim(), 'foo:bar', 'incorrect pipeline name');
    assert.equal(find('.line1 h1').text().trim(), 'PR-50', 'incorrect job name');
    assert.equal(find('span.sha').text().trim(), '#c96f36', 'incorrect sha');
    assert.equal(find('.is-open .logs').text().trim(), 'bad stuff', 'incorrect logs open');
    assert.equal(find('button').text().trim(), 'Restart', 'found a restart button');
  });

  click('button');
  andThen(() => {
    assert.equal(currentURL(), '/pipelines/abcd/build/5678');
    // A bug in ember-simple-auth prevents transitions from completing in acceptance tests
  });
});
