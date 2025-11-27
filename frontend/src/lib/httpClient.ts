import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// ⚙️ Load credentials safely (hardcode for now or pull from .env)
export const SUPABASE_URL = 'https://oendriwadwjztxqczqlp.supabase.co/functions/v1';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbmRyaXdhZHdqenR4cWN6cWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxOTc5OTAsImV4cCI6MjA3Mjc3Mzk5MH0.yhATNst6nnbTTGxHQzr7hoJk0PFVasSChZ-f74W8be0';
