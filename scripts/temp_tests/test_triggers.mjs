import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Helper to read and parse environment variables from .env.local
function loadEnv() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local file not found');
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      env[match[1]] = value;
    }
  });
  return env;
}

async function runTest() {
  console.log('🔄 Avvio Test di Integrazione per i Trigger di PostgreSQL...');

  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Credenziali Supabase mancanti in .env.local');
  }

  // Utilizziamo la service_role per bypassare le policy RLS durante i test di sistema
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const testBranch = 'TestBranch_' + Math.random().toString(36).substring(7);
  const testDate = '2026-06-24';
  const testAmount = 75000;
  
  let accountId = null;
  let cashoutId = null;
  let originalSettings = null;
  let settingsUpdated = false;

  try {
    // 1. Assicurarsi che le impostazioni dell'app abbiano una data di inizio finanza
    console.log('1. Configurazione app_settings...');
    const { data: settings, error: getSettingsErr } = await supabase
      .from('app_settings')
      .select('*')
      .limit(1);

    if (getSettingsErr) throw getSettingsErr;

    if (settings && settings.length > 0) {
      originalSettings = { ...settings[0] };
      const { error: updSettingsErr } = await supabase
        .from('app_settings')
        .update({ finance_start_date: '2026-01-01' })
        .eq('id', originalSettings.id);
      if (updSettingsErr) throw updSettingsErr;
      settingsUpdated = true;
    } else {
      // Inseriamo impostazioni temporanee
      const { error: insSettingsErr } = await supabase
        .from('app_settings')
        .insert({ id: 'default', finance_start_date: '2026-01-01' });
      if (insSettingsErr) throw insSettingsErr;
      settingsUpdated = true;
    }

    // 2. Creare un conto cassa fittizio per la filiale di test
    console.log(`2. Creazione conto cassa per ${testBranch}...`);
    const { data: account, error: accErr } = await supabase
      .from('fin_bank_accounts')
      .insert({
        account_type: 'Cash',
        account_name: 'Cash on Hand - ' + testBranch,
        current_balance: 1000000, // 1 milione di saldo iniziale
      })
      .select()
      .single();

    if (accErr) throw accErr;
    accountId = account.id;

    // 3. Eseguire l'inserimento di un Cashout (questo dovrebbe attivare il trigger)
    console.log('3. Inserimento record cashout...');
    const { data: cashout, error: cashoutErr } = await supabase
      .from('cashout')
      .insert({
        branch: testBranch,
        date: testDate,
        amount: testAmount,
        description: 'Test Cashout per verifica trigger',
      })
      .select()
      .single();

    if (cashoutErr) throw cashoutErr;
    cashoutId = cashout.id;

    // 4. Verificare che la transazione sia stata creata in fin_bank_transactions
    console.log('4. Verifica creazione transazione e saldo...');
    const { data: transactions, error: txErr } = await supabase
      .from('fin_bank_transactions')
      .select('*')
      .eq('reference_id', cashoutId)
      .eq('reference_type', 'Cashout');

    if (txErr) throw txErr;

    if (!transactions || transactions.length === 0) {
      throw new Error('ERRORE: La transazione corrispondente non è stata creata dal trigger DB!');
    }
    console.log('   ✅ Transazione creata correttamente dal trigger.');

    // 5. Verificare che il saldo del conto cassa sia diminuito
    const { data: updatedAccount, error: getAccErr } = await supabase
      .from('fin_bank_accounts')
      .select('current_balance')
      .eq('id', accountId)
      .single();

    if (getAccErr) throw getAccErr;

    const expectedBalance = 1000000 - testAmount;
    if (Number(updatedAccount.current_balance) !== expectedBalance) {
      throw new Error(`ERRORE: Saldo errato. Atteso: ${expectedBalance}, Trovato: ${updatedAccount.current_balance}`);
    }
    console.log('   ✅ Saldo del conto cassa aggiornato correttamente.');

    // 6. Eseguire la cancellazione per verificare il trigger di delete
    console.log('5. Cancellazione del record cashout...');
    const { error: delErr } = await supabase
      .from('cashout')
      .delete()
      .eq('id', cashoutId);

    if (delErr) throw delErr;

    // 7. Verificare che la transazione sia stata rimossa
    const { data: deletedTransactions, error: getTxErr } = await supabase
      .from('fin_bank_transactions')
      .select('*')
      .eq('reference_id', cashoutId)
      .eq('reference_type', 'Cashout');

    if (getTxErr) throw getTxErr;

    if (deletedTransactions && deletedTransactions.length > 0) {
      throw new Error('ERRORE: La transazione non è stata rimossa dal trigger DB dopo la cancellazione del cashout!');
    }
    console.log('   ✅ Transazione rimossa dal trigger di eliminazione.');

    // 8. Verificare che il saldo sia tornato a 1 milione
    const { data: finalAccount, error: getFinalAccErr } = await supabase
      .from('fin_bank_accounts')
      .select('current_balance')
      .eq('id', accountId)
      .single();

    if (getFinalAccErr) throw getFinalAccErr;

    if (Number(finalAccount.current_balance) !== 1000000) {
      throw new Error(`ERRORE: Saldo non ripristinato. Atteso: 1000000, Trovato: ${finalAccount.current_balance}`);
    }
    console.log('   ✅ Saldo del conto cassa ripristinato correttamente.');

    console.log('🎉 TEST COMPLETATO CON SUCCESSO! I trigger funzionano perfettamente.');

  } catch (error) {
    console.error('❌ ERRORE DURANTE IL TEST:', error.message);
    process.exitCode = 1;
  } finally {
    console.log('🔄 Pulizia dei dati di test...');
    
    // Ripristiniamo lo stato precedente delle impostazioni
    if (settingsUpdated && originalSettings) {
      await supabase
        .from('app_settings')
        .update({ finance_start_date: originalSettings.finance_start_date })
        .eq('id', originalSettings.id);
    }

    // Rimuoviamo il conto cassa temporaneo
    if (accountId) {
      await supabase.from('fin_bank_accounts').delete().eq('id', accountId);
    }
    console.log('✅ Pulizia completata.');
  }
}

runTest();
