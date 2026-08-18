import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://gfnpyzmhhwkpzvjwkckg.supabase.co",
  "sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz"
);

// Carrega correções globais de UI depois de o cliente Supabase estar disponível.
import './ui-fixes.js';
