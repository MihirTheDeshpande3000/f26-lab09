import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Claim: a token works on any request, whichever API copy answers it.
// Supply a member token printed by exactly one API copy:
// docker compose run --rm --no-deps -e TOKEN=<token> k6 run /load/token-any-copy.js

const tokenWorks = new Rate('token_works_on_answering_copy');
const upstreamsSeen = new Counter('distinct_upstreams_seen');
const responses = new Counter('proxied_responses');
const seen = new Set();

export const options = {
  vus: 1,
  iterations: 30,
  thresholds: {
    token_works_on_answering_copy: ['rate==1'],
    distinct_upstreams_seen: ['count>=2'],
    proxied_responses: ['count==30'],
  },
};

export function setup() {
  if (!__ENV.TOKEN) {
    throw new Error('TOKEN is required; copy a u-1 token from docker compose logs api');
  }
}

export default function () {
  const response = http.get('http://proxy/bookings', {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });

  responses.add(1);
  tokenWorks.add(response.status === 200);
  check(response, {
    'token is accepted': (r) => r.status === 200,
    'proxy identifies the answering copy': (r) => Boolean(r.headers['X-Upstream']),
  });

  const upstream = response.headers['X-Upstream'];
  if (upstream && !seen.has(upstream)) {
    seen.add(upstream);
    upstreamsSeen.add(1);
    console.log(`new X-Upstream: ${upstream}`);
  }
}

