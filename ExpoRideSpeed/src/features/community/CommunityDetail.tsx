import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Glass, Note, Row, T } from '../../components/ui';
import { communityErrorKey } from '../../lib/communityI18n';
import { useApp } from '../../state/AppState';
import { RouteSheet } from '../routes/RouteSheet';
import { codepointCount, validateComment, validateReportDetail } from './content';
import { CommunityMediaView } from './CommunityMedia';
import { CommunityChoices, CommunityMonogram, CommunityStatus } from './CommunityParts';
import { PostCard } from './PostCard';
import type { CommunityAudience, CommunityComment, CommunityMedia, CommunityPost, CommunityReportReason } from './types';
import { communityPostBinding, type CommunityDetailProps, type CommunityPostBinding } from './uiTypes';
import { useCommunityUI } from './useCommunityUI';

type Review = { binding: CommunityPostBinding; kind: 'options' | 'report' | 'block' | 'audience' | 'delete' | 'deleteComment'; commentId: string | null };
const galleryViewability = { itemVisiblePercentThreshold: 30, minimumViewTime: 250 };

function PhotoGallery({ post, port, t }: { post: CommunityPost } & CommunityDetailProps) {
 const { width } = useWindowDimensions(), [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
 const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<CommunityMedia>[] }) => {
  setVisible(new Set(viewableItems.filter(v => v.isViewable).map(v => v.item.media_id)));
 }, []);
 if (!post.media.length) return null;
 return <FlashList horizontal data={post.media} keyExtractor={media => media.media_id} drawDistance={240} maintainVisibleContentPosition={{disabled:true}} scrollEnabled={!port.gate.moving} showsHorizontalScrollIndicator={false} viewabilityConfig={galleryViewability} onViewableItemsChanged={onViewable} contentContainerStyle={{ gap: 12 }} renderItem={({ item, index }) => <View style={{ width: Math.max(220, Math.min(width - 48, 620)), gap: 8 }}><CommunityMediaView post={post} media={item} port={port} t={t} visible={visible.has(item.media_id)} /><T size={12} muted>{t('m7.photo', { index: index + 1, count: post.media.length })}</T>{item.validation === 'legacy_unverified' && <T size={12} muted>{t('m7.legacyPhoto')}</T>}</View>} />;
}

export function CommunityDetail({ port, t }: CommunityDetailProps) {
 const { colors, motion } = useApp(), insets = useSafeAreaInsets(), ui = useCommunityUI(port), list = useRef<FlashListRef<CommunityComment>>(null);
 const [body, setBody] = useState(''), [review, setReview] = useState<Review | null>(null), [reason, setReason] = useState<CommunityReportReason>('privacy'), [detail, setDetail] = useState(''), [audience, setAudience] = useState<CommunityAudience>('friends');
 const bodyRef = useRef(body), reviewRef = useRef<Review | null>(null), commentAttempt = useRef<{ body: string; postId: string; revision: number; id: string } | null>(null);
 useLayoutEffect(() => { bodyRef.current = body; }, [body]);
 const post = port.detail?.owner_id === port.ownerId && port.current(port.generation) && port.detail?.post && port.postCurrent(communityPostBinding(port.detail.post)) ? port.detail.post : null;
 const postId = post?.post_id, postRevision = post?.content_revision;
 // Retiring the presentation never discards a persisted parent operation or photo.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { reviewRef.current = null; setReview(null); setDetail(''); setBody(''); commentAttempt.current = null; }, [port.generation, port.gate.focused, port.gate.foreground, port.gate.moving, postId, postRevision]);
 const editable = ui.canEdit && !ui.busy, controls = ui.enabled && port.read.fresh && !port.read.error && !ui.busy;
 const closeReview = () => { reviewRef.current = null; setReview(null); setDetail(''); ui.invalidate(); };
 const checked = (p: typeof port, binding: CommunityPostBinding) => { if (!p.postCurrent(binding) || !p.read.fresh || p.read.error || p.detail?.post.post_id !== binding.post_id || p.detail.post.content_revision !== binding.content_revision) throw Error('COMMUNITY_CHANGED'); return p.detail.post; };
 const openReview = (kind: Review['kind'], commentId: string | null = null) => {
  if (!post) return;
  const binding = communityPostBinding(post);
  void ui.run(p => { const row = checked(p, binding); if ((kind === 'delete' || kind === 'audience') && row.owner_id !== p.ownerId) throw Error('COMMUNITY_CHANGED'); if (kind === 'deleteComment' && !p.comments.some(c => c.comment_id === commentId && c.owner_id === p.ownerId && c.can_delete)) throw Error('COMMUNITY_CHANGED'); const next = { binding, kind, commentId }; reviewRef.current = next; setReview(next); setReason('privacy'); setDetail(''); setAudience(row.visibility); });
 };
 const selectReview = (kind: Review['kind']) => { try { const p = ui.guard('control'), current = reviewRef.current; if (!current) return; const row = checked(p, current.binding); if ((kind === 'audience' || kind === 'delete') && row.owner_id !== p.ownerId || kind === 'block' && row.owner_id === p.ownerId) throw Error('COMMUNITY_CHANGED'); const next = { ...current, kind }; reviewRef.current = next; setReview(next); } catch (error) { ui.setError(communityErrorKey(error)); } };
 const confirmReview = () => {
  const captured = review, capturedReason = reason, capturedDetail = detail, capturedAudience = audience;
  return ui.run(async p => {
   if (!captured || reviewRef.current !== captured) throw Error('COMMUNITY_REVIEW_REQUIRED'); const row = checked(p, captured.binding), common = { schema_version: 1 as const, post_id: row.post_id, expected_revision: row.content_revision };
   let operation: string | null = null;
   if (captured.kind === 'block') { if (row.owner_id === p.ownerId) throw Error('COMMUNITY_CHANGED'); operation = await p.blockAuthor(captured.binding); }
   else if (captured.kind === 'report') { if (!validateReportDetail(capturedDetail) || captured.commentId && !p.comments.some(c => c.comment_id === captured.commentId && c.post_id === row.post_id)) throw Error('COMMUNITY_CHANGED'); operation = await p.mutate({ ...common, action: 'report', comment_id: captured.commentId, reason: capturedReason, detail: capturedDetail }); }
   else if (captured.kind === 'deleteComment') { if (!p.comments.some(c => c.comment_id === captured.commentId && c.owner_id === p.ownerId && c.can_delete)) throw Error('COMMUNITY_CHANGED'); operation = await p.mutate({ ...common, action: 'delete_comment', comment_id: captured.commentId! }); }
   else { if (row.owner_id !== p.ownerId) throw Error('COMMUNITY_CHANGED'); operation = captured.kind === 'audience' ? await p.mutate({ ...common, action: 'audience', visibility: capturedAudience }) : captured.kind === 'delete' ? await p.mutate({ ...common, action: 'delete_post' }) : null; }
   if (ui.current() && operation && reviewRef.current === captured) { reviewRef.current = null; setReview(null); setDetail(''); } return operation;
  });
 };
 const sendComment = () => {
  if (!post) return;
  const binding = communityPostBinding(post), captured = body;
  return ui.run(async p => {
   checked(p, binding); if (!validateComment(captured) || bodyRef.current !== captured) throw Error('COMMUNITY_COMMENT_LIMIT'); let attempt = commentAttempt.current;
   if (!attempt || attempt.body !== captured || attempt.postId !== binding.post_id || attempt.revision !== binding.content_revision) { attempt = { body: captured, postId: binding.post_id, revision: binding.content_revision, id: p.commentUUID() }; commentAttempt.current = attempt; }
   const operation = await p.mutate({ schema_version: 1, action: 'comment', post_id: binding.post_id, expected_revision: binding.content_revision, comment_id: attempt.id, body: captured });
   if (ui.current() && operation && bodyRef.current === captured) { setBody(''); bodyRef.current = ''; commentAttempt.current = null; } return operation;
  });
 };
 const act = (row: CommunityPost, action: 'like' | 'save' | 'open' | 'route' | 'share') => void ui.run(async p => {
  const binding = communityPostBinding(row); if (!p.postCurrent(binding)) throw Error('COMMUNITY_CHANGED');
  if (action === 'open') { list.current?.scrollToEnd({ animated: motion }); return; } if (action === 'route') { p.onOpenRoute(binding); return; } checked(p, binding);
  if (action === 'share') { await p.onShare(binding); return; }
  const pending = p.pending.filter(op => op.request.post_id === row.post_id && op.request.expected_revision === row.content_revision && op.request.action === action).at(-1)?.request;
  return p.mutate(action === 'like' ? { schema_version: 1, action, post_id: row.post_id, expected_revision: row.content_revision, liked: !(pending?.action === 'like' ? pending.liked : row.engagement.liked) } : { schema_version: 1, action, post_id: row.post_id, expected_revision: row.content_revision, saved: !(pending?.action === 'save' ? pending.saved : row.engagement.saved) });
 }, action === 'open' || action === 'route' ? 'navigation' : 'control');
 const title = !review || review.kind === 'options' ? 'm7.optionsTitle' : review.kind === 'report' ? 'm7.reportTitle' : review.kind === 'block' ? 'm7.block' : review.kind === 'audience' ? 'm7.changeAudience' : review.kind === 'deleteComment' ? 'm7.deleteComment' : 'm7.deletePost';
 const header = <View style={{ gap: 18 }}><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Button small secondary icon="arrow-back-outline" label={t('m7.back')} disabled={!ui.canNavigate} onPress={() => ui.run(p => p.onBack(), 'navigation')} /><T size={26} weight="semibold" accessibilityRole="header">{t('m7.title')}</T>{post && <Button small secondary icon="ellipsis-horizontal" label={t('m7.moreActions')} disabled={!controls} onPress={() => openReview('options')} />}</Row>{port.gate.moving && <Note>{t('m7.moving')}</Note>}{!port.gate.online && <Note>{t('m7.offline')}</Note>}{port.read.error && <Note error>{t(communityErrorKey(port.read.error))}</Note>}{post && !port.read.fresh && <Note>{t('m7.stale')}</Note>}<CommunityStatus port={port} t={t} operation={ui.operation} error={ui.error} retry={() => void ui.run(p => p.retry())} /><Button small secondary icon="refresh-outline" label={t('m7.refresh')} disabled={!ui.enabled} busy={port.read.loading || ui.busy} onPress={() => ui.run(p => p.refresh(), 'read')} />{post ? <><PostCard post={post} port={port} t={t} visible={false} detail showMedia={false} act={act} /><PhotoGallery post={post} port={port} t={t} /><T size={23} weight="semibold" accessibilityRole="header">{t('m7.commentTitle')}</T>{port.commentsRead.error && <Note error>{t(communityErrorKey(port.commentsRead.error))}</Note>}{port.commentsRead.loading && <Row><ActivityIndicator color={colors.accent} /><T>{t('m7.loadingComments')}</T></Row>}{port.commentsRead.fresh && !port.commentsRead.error && !port.commentsRead.loading && !port.commentsRead.hasMore && port.comments.length === 0 && port.gate.online && <T muted>{t('m7.commentsEmpty')}</T>}</> : port.read.loading ? <ActivityIndicator color={colors.accent} /> : <Note>{t('m7.unavailable')}</Note>}</View>;
 return <View style={{ flex: 1, backgroundColor: colors.bg }}><FlashList ref={list} data={post ? port.comments.filter(c => c.post_id === post.post_id) : []} keyExtractor={c => c.comment_id} drawDistance={400} maintainVisibleContentPosition={{disabled:true}} scrollEnabled={!port.gate.moving} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 124, gap: 18 }} ListHeaderComponent={header} renderItem={({ item }) => <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16, gap: 10 }}><Row style={{ alignItems: 'flex-start' }}><CommunityMonogram name={item.profile.name} /><View style={{ flex: 1, gap: 5 }}><T weight="semibold">{item.profile.name}</T><T>{item.body}</T></View></Row><Row style={{ flexWrap: 'wrap' }}>{item.can_delete && item.owner_id === port.ownerId && <Button small secondary label={t('m7.deleteComment')} disabled={!controls || !port.commentsRead.fresh || !!port.commentsRead.error} onPress={() => openReview('deleteComment', item.comment_id)} />}<Button small secondary label={t('m7.report')} disabled={!controls || !port.commentsRead.fresh || !!port.commentsRead.error} onPress={() => openReview('report', item.comment_id)} /></Row></View>} ListFooterComponent={<View style={{ gap: 18 }}>{post && port.commentsRead.hasMore && <Button secondary label={t('m7.moreComments')} disabled={!ui.enabled || !port.commentsRead.fresh || !!port.commentsRead.error || ui.busy} busy={port.commentsRead.loading || ui.busy} onPress={() => ui.run(async p => { checked(p, communityPostBinding(post)); if (!p.commentsRead.fresh || p.commentsRead.error) throw Error('COMMUNITY_CHANGED'); await p.loadMoreComments(); }, 'read')} />}<Glass style={{ padding: 16, gap: 12 }}><Field label={t('m7.commentBody')} value={body} multiline editable={editable && !!post} onChangeText={text => { try { ui.guard('edit'); if (codepointCount(text) > 1000) throw Error('COMMUNITY_COMMENT_LIMIT'); setBody(text); bodyRef.current = text; } catch (error) { ui.setError(communityErrorKey(error)); } }} /><T numeric size={12} muted>{t('m7.commentCount', { count: codepointCount(body) })}</T><Button label={t('m7.sendComment')} disabled={!controls || !post || !validateComment(body)} busy={ui.busy} onPress={sendComment} /></Glass></View>} /><RouteSheet visible={!!review} title={t(title)} onClose={closeReview}>{review?.kind === 'options' ? <><Button secondary label={t('m7.report')} disabled={!controls} onPress={() => selectReview('report')} />{post?.owner_id === port.ownerId ? <><Button secondary label={t('m7.changeAudience')} disabled={!controls} onPress={() => selectReview('audience')} /><Button secondary label={t('m7.deletePost')} disabled={!controls} onPress={() => selectReview('delete')} /></> : <Button secondary label={t('m7.block')} disabled={!controls} onPress={() => selectReview('block')} />}</> : review?.kind === 'report' ? <><T>{t('m7.reportBody')}</T><CommunityChoices values={(['spam', 'harassment', 'privacy', 'dangerous', 'other'] as const).map(value => ({ value, label: t(`m7.report.${value}`) }))} selected={reason} disabled={!controls} onChange={value => { try { ui.guard('control'); setReason(value); } catch { /* A retired review stays unchanged. */ } }} /><Field label={t('m7.reportDetail')} value={detail} multiline editable={controls} onChangeText={text => { try { ui.guard('edit'); if (validateReportDetail(text)) setDetail(text); else ui.setError('m7.error.report'); } catch { /* No old review edits. */ } }} /><Button label={t('m7.sendReport')} disabled={!controls} busy={ui.busy} onPress={confirmReview} /></> : review?.kind === 'audience' ? <><T>{t('m7.reviewBody')}</T><CommunityChoices values={(['private', 'friends', 'public'] as const).map(value => ({ value, label: t(`m7.audience.${value}`) }))} selected={audience} disabled={!controls} onChange={value => { try { ui.guard('control'); setAudience(value); } catch { /* No old review edits. */ } }} /><Button label={t('m7.confirmAudience')} disabled={!controls} busy={ui.busy} onPress={confirmReview} /></> : review ? <><T>{t(review.kind === 'block' ? 'm7.blockBody' : review.kind === 'deleteComment' ? 'm7.deleteCommentBody' : 'm7.deleteBody')}</T><Button label={t(review.kind === 'block' ? 'm7.confirmBlock' : review.kind === 'deleteComment' ? 'm7.deleteComment' : 'm7.confirmDelete')} disabled={!controls} busy={ui.busy} onPress={confirmReview} /></> : null}</RouteSheet></View>;
}
export default CommunityDetail;
