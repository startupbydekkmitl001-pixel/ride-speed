import { authenticate, failure, HttpError, preflight, readId, response } from '../_shared/http.ts';

Deno.serve(async req => {
  try {
    const options = preflight(req); if (options) return options;
    const { userClient, admin } = await authenticate(req);
    const id = await readId(req, 'postId');
    // This query uses the caller's JWT and post RLS. No caller-supplied storage path.
    const { data: post, error } = await userClient.from('rs_posts').select('media_path').eq('id', id).maybeSingle();
    if (error) throw new HttpError(503, 'POST_LOOKUP_FAILED');
    if (!post?.media_path) throw new HttpError(404, 'MEDIA_UNAVAILABLE');
    const { data, error: signedError } = await admin.storage.from('ride-community').createSignedUrl(post.media_path, 60);
    if (signedError || !data?.signedUrl) throw new HttpError(503, 'MEDIA_UNAVAILABLE');
    return response(req, { url: data.signedUrl, expiresIn: 60 });
  } catch (error) { return failure(req, error); }
});
