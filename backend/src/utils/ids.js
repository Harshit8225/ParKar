'use strict';

const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I - these get read aloud at gates

/** Short, unambiguous, human-readable code. */
const shortCode = (length = 6) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

const bookingId = () => `BK-${shortCode(8)}`;
const sessionId = () => `PS-${shortCode(8)}`;
const receiptId = () => `RCPT-${shortCode(10)}`;

module.exports = { shortCode, bookingId, sessionId, receiptId };
