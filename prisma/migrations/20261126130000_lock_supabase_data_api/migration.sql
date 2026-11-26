-- On Supabase, tables in "public" are reachable through the Data API (PostgREST) with the
-- public anon key. iSchoolie only reaches Postgres through Prisma as the table owner, so
-- the app's tables get row level security with no policies (deny all for API roles) and
-- the API roles lose their table privileges. Only iSchoolie's own tables are touched.
-- On plain PostgreSQL (no anon/authenticated roles) only RLS is enabled, which the owner
-- bypasses, so behaviour is unchanged.
DO $$
DECLARE
  t text;
  app_tables text[] := ARRAY[
    'DemoWorkspace','DemoSession','RateLimit','User','Preferences','Follow','FollowRequest','Block','Mute',
    'MutedWord','Post','Mention','Like','Repost','MediaAsset','PostMedia','Poll','PollOption','PollVote',
    'Bookmark','List','ListMember','ListSubscription','ListPin','Topic','TopicFollow','Moment','MomentItem',
    'Conversation','Participant','Message','MessageAttachment','MessageHidden','MessageReaction','Notification',
    'HiddenReply','ConversationMute','SavedSearch','RecentSearch','Draft','ScheduledPost','Job','Report',
    'PostEvent','IdempotencyRecord','LinkPreview','AuthIdentity','_prisma_migrations'
  ];
  api_roles boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
                   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      IF api_roles THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      END IF;
    END IF;
  END LOOP;
END $$;
