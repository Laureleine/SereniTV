import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://flvvjlytntnethjyyuix.supabase.co';
const supabaseAnonKey = 'sb_publishable_EqJXXZxlj275uOy6HZBDMA_umKr2GM8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('series').select('*').limit(1);
  if (error) {
    console.error("Error fetching series:", error);
  } else {
    console.log("Series data:", data);
  }
}

check();
