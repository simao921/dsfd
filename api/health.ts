type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => void };

export default function health(_request: unknown, response: ApiResponse) {
  response.status(200).json({
    status: 'ok',
    supabaseConfigured: Boolean(
      process.env.SUPABASE_URL?.trim()
      && process.env.SUPABASE_ANON_KEY?.trim()
      && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
  });
}
