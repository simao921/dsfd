#!/usr/bin/env node
import 'dotenv/config';
import { createHash, randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? '' : String(process.argv[index + 1] ?? '').trim();
}

function required(name, value) {
  if (!value) throw new Error(`Falta o parâmetro obrigatório ${name}.`);
  return value;
}

function generatePassword() {
  const groups = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*()-_=+[]{}',
  ];
  const all = groups.join('');
  const chars = groups.map((group) => group[randomInt(group.length)]);
  while (chars.length < 28) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function usernameBase(fullName) {
  return fullName.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52) || 'admin';
}

async function main() {
  const fullName = required('--name', option('--name'));
  const email = required('--email', option('--email')).toLowerCase();
  if (fullName.length < 2 || fullName.length > 120) throw new Error('O nome deve ter entre 2 e 120 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Indica um endereço de email válido.');

  const supabaseUrl = required('SUPABASE_URL', process.env.SUPABASE_URL?.trim());
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = generatePassword();
  let authUserId = '';
  let profileCreated = false;

  try {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (created.error) throw new Error(`Não foi possível criar o utilizador Auth: ${created.error.message}`);
    if (!created.data.user?.id) throw new Error('O Supabase não devolveu o ID da conta criada.');
    authUserId = created.data.user.id;

    const base = usernameBase(fullName);
    let username = '';
    for (let suffix = 1; suffix <= 999; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base.slice(0, 52 - String(suffix).length - 1)}-${suffix}`;
      const lookup = await supabase.from('profiles').select('id').eq('username_normalized', candidate).maybeSingle();
      if (lookup.error) throw new Error(`Não foi possível verificar o nome de utilizador. Confirma primeiro que aplicaste a migração SQL. (${lookup.error.code ?? 'erro'})`);
      if (!lookup.data) { username = candidate; break; }
    }
    if (!username) throw new Error('Não foi possível gerar um nome de utilizador único.');

    const profile = await supabase.from('profiles').insert({
      id: authUserId,
      role: 'admin',
      username,
      full_name: fullName,
      enabled: true,
      password_change_required: true,
    });
    if (profile.error) throw new Error(`Não foi possível criar o perfil de administração: ${profile.error.message}`);
    profileCreated = true;

    const fingerprint = createHash('sha256').update(password, 'utf8').digest('hex');
    const credential = await supabase.from('issued_credential_fingerprints').insert({ fingerprint, profile_id: authUserId });
    if (credential.error) throw new Error(`Não foi possível registar o controlo da credencial inicial: ${credential.error.message}`);

    console.log('\nConta de administrador criada. Copia a password agora; não será mostrada novamente.');
    console.log(`Nome: ${fullName}`);
    console.log(`Email: ${email}`);
    console.log(`Utilizador: ${username}`);
    console.log(`Password inicial: ${password}`);
    console.log('No primeiro acesso, será obrigatório definir uma password nova.\n');
  } catch (error) {
    if (profileCreated) {
      await supabase.from('issued_credential_fingerprints').delete().eq('profile_id', authUserId).then(() => undefined).catch(() => undefined);
      await supabase.from('profiles').delete().eq('id', authUserId).then(() => undefined).catch(() => undefined);
    }
    if (authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error(`Criação cancelada: ${error instanceof Error ? error.message : 'erro inesperado'}`);
  process.exitCode = 1;
});
