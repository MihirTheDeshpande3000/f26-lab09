import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Claim: a room slot is booked at most once across all API copies.
// API_ONE and API_TWO are distinct live API hostnames or IP addresses.
// Each token must come from the corresponding copy's startup log.

const confirmedBookings = new Counter('confirmed_bookings_for_same_slot');
const attemptedCopies = new Counter('direct_api_copies_attempted');
const validResponses = new Rate('valid_booking_responses');

export const options = {
  scenarios: {
    copy_one: { executor: 'shared-iterations', exec: 'bookOnCopyOne', vus: 1, iterations: 1 },
    copy_two: { executor: 'shared-iterations', exec: 'bookOnCopyTwo', vus: 1, iterations: 1 },
  },
  thresholds: {
    // This is the claim under test. It intentionally fails when both copies return 201.
    confirmed_bookings_for_same_slot: ['count<=1'],
    direct_api_copies_attempted: ['count==2'],
    valid_booking_responses: ['rate==1'],
  },
};

export function setup() {
  for (const name of ['API_ONE', 'API_TWO', 'TOKEN_ONE', 'TOKEN_TWO']) {
    if (!__ENV[name]) {
      throw new Error(`${name} is required`);
    }
  }

  if (__ENV.API_ONE === __ENV.API_TWO) {
    throw new Error('API_ONE and API_TWO must identify different copies');
  }

  // Tomorrow is inside the 60-day advance limit. Use a valid 30-minute UTC slot.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = tomorrow.toISOString().slice(0, 10);
  const apiOne = `http://${__ENV.API_ONE}:8080`;
  const apiTwo = `http://${__ENV.API_TWO}:8080`;
  const tokens = [__ENV.TOKEN_ONE, __ENV.TOKEN_TWO];
  // A repeated run must not pass merely because both copies already hold the slot.
  for (let i = 0; i < 2; i += 1) {
    const base = i === 0 ? apiOne : apiTwo;
    const response = http.get(`${base}/bookings`, {
      headers: { Authorization: `Bearer ${tokens[i]}` },
    });
    if (response.status !== 200) {
      throw new Error(`preflight failed for ${base}: HTTP ${response.status}`);
    }
    if (response.json('bookings').length !== 0) {
      throw new Error('Use fresh API processes before this test: existing bookings would invalidate the experiment');
    }
  }
  return {
    start: __ENV.START || `${day}T15:00:00Z`,
    end: __ENV.END || `${day}T15:30:00Z`,
    apiOne,
    apiTwo,
    tokenOne: tokens[0],
    tokenTwo: tokens[1],
  };
}

function book(baseUrl, token, data) {
  const body = {
    roomId: 'r-1',
    start: data.start,
    end: data.end,
    attendees: '1',
  };
  const response = http.post(`${baseUrl}/bookings`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });

  attemptedCopies.add(1);
  confirmedBookings.add(response.status === 201 ? 1 : 0);
  validResponses.add(response.status === 201 || response.status === 202);
  check(response, {
    'copy made a valid booking decision': (r) => r.status === 201 || r.status === 202,
  });
  console.log(`${baseUrl} returned ${response.status}: ${response.body}`);
}

export function bookOnCopyOne(data) {
  book(data.apiOne, data.tokenOne, data);
}

export function bookOnCopyTwo(data) {
  book(data.apiTwo, data.tokenTwo, data);
}

