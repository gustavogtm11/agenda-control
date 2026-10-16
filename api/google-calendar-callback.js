import googleCalendarOAuthHandler from './google-calendar-oauth.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), action: 'callback' };
  return googleCalendarOAuthHandler(req, res);
}
