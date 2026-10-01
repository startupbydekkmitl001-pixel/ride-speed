-- READ ONLY only after catalog preflight confirms vault.secrets exists and the
-- trusted operator can SELECT its metadata. Never select secret/decrypted values
-- or unrelated names/IDs. No creation, update, scheduling or invocation occurs.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'required_names',jsonb_build_object(
   'project_url',(select count(*) from vault.secrets where name='project_url'),
   'service_role_key',(select count(*) from vault.secrets where name='service_role_key')
 ),
 'each_name_present_once',
   (select count(*)=1 from vault.secrets where name='project_url')
   and(select count(*)=1 from vault.secrets where name='service_role_key')
) as community_cleanup_vault_metadata;
