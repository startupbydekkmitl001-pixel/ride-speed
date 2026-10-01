import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../src/', import.meta.url));
const friend = { user_id: '00000000-0000-4000-8000-000000000001', handle: 'rider_one', display_name: 'Rider One', state: 'pending', direction: 'incoming', generation: 4, updated_at: '2026-10-01T01:00:00Z' };
function fixture(component='FriendsScreen') {
  const calls = [], refs = [], states = [],effects=[];
  let refIndex = 0, stateIndex = 0, effectIndex=0, pendingEffects=[], tree;
  const source = { moving: false, focused:true, current: true, choices:{routes:[],courses:[],sessions:[],routeCursor:null},reviews:[], social: {
    ready: true, fresh: true, loading: false, profileReady: true, optedIn: false, accountRevision: 1, reviewRequired: [],
    friends: [friend], presence: [], blocked: [], invitations: [], pending: [], busy: false, error: null, latest: null,
    pages: Object.fromEntries(['friends', 'blocked', 'invitations'].map(key => [key, { loading: false, error: null, hasMore: false }])),
    refresh: async () => {}, loadMoreFriends: async () => {}, loadMoreBlocked: async () => {}, loadMoreInvitations: async () => {},
    mutate: async request => { calls.push(request); return '00000000-0000-4000-8000-000000000002'; }, retry: async () => {}, setPresence: async () => {},
  } };
  const scope = { generation: 1, userId: '00000000-0000-4000-8000-000000000003' };
  const jsx = (type, props) => ({ type, props });
  const react = { useRef: current => { const index = refIndex++; return refs[index] ??= { current }; },
    useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useCallback: value => value, useMemo: callback => callback(), useLayoutEffect: callback => { callback(); }, useEffect: (callback,deps) => {const index=effectIndex++,old=effects[index];if(!old||!deps||deps.some((value,i)=>value!==old.deps?.[i])){pendingEffects.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:callback()};});}},
  };
  const colors = { bg: '#000', raised: '#111', surface: '#0A0A0A', ink: '#FFF', muted: '#999', line: '#333', accent: '#FF5A1F', good: '#2EE6A6', danger: '#FF3B5C', onAccent: '#000' };
  const ui = Object.fromEntries(['Button', 'Empty', 'Field', 'Heading', 'Icon', 'IconButton', 'Note', 'Panel', 'Row', 'Screen', 'Segments', 'T', 'Glass'].map(key => [key, key]));
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({remove(){}}) }, FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Pressable: 'Pressable', View: 'View', Switch: 'Switch', RefreshControl: 'RefreshControl', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    'expo-router': { router: { back: () => {}, push: () => {} }, useFocusEffect: () => {}, useIsFocused: () => source.focused },
    '@react-navigation/native': { useIsFocused: () => true },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../../state/SocialState': { useSocial: () => source.social },
    '../../state/AuthState': { useAuth: () => ({ session: { user: { id: scope.userId } }, scope }), isAccountCurrent: () => source.current },
    '../../state/AppState': { useApp: () => ({ colors, dark: true, motion: false }) },
    '../../state/RideState': { useRide: () => ({ movingLocked: source.moving }) },
    '../../lib/i18n': { useI18n: () => ({ t: key => key, language: 'en', locale: 'en-US' }), errorKey: error => String(error?.message ?? error) },
    '../../lib/useNow': { useNow: () => Date.parse('2026-10-01T12:00:00Z') }, '../../components/ui': ui,
    '../routes/RouteSheet': { RouteSheet: 'RouteSheet' }, '../routes/SharedRouteSnapshot': { default: 'SharedRouteSnapshot' },
    './SocialSurface': { SocialHeader: 'SocialHeader', SocialPending: 'SocialPending', SocialReadState: 'SocialReadState', useConnectivityHint: () => true },
    'expo-crypto': { randomUUID: () => '00000000-0000-4000-8000-000000000010' },
    './invitationReviewService': {getInvitationChoices: async()=>source.getChoices?source.getChoices():source.choices,getInvitationRoutePage:async()=>source.nextRoutes,reviewInvitation:async(_scope,_session,input)=>{source.reviews.push(input);return {...input,shared:{id:input.route.id,owner_id:scope.userId,title:input.route.title,revision:input.route.revision,category:input.route.category,visibility:'private',segments:[],geometryStatus:'hidden',geometryHash:null,privacyTrimMeters:200,provider:'draft',attribution:null},course:null,session:null};}},
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const code = ts.transpileModule(text, { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(code, { module, exports: module.exports, console, URL, Date, require: name => {
      if (name in deps) return deps[name];
      if (!name.startsWith('.')) return require(name);
      let next = resolve(dirname(path), name);
      if (!existsSync(next)) for (const extension of ['.ts', '.tsx']) if (existsSync(next + extension)) { next += extension; break; }
      return load(next);
    } }, { filename: path });
    return module.exports;
  }
  const Friends = load(resolve(root, `features/social/${component}.tsx`)).default;
  function render() { assert.equal(typeof Friends, 'function'); refIndex = stateIndex = effectIndex=0;pendingEffects=[]; tree = Friends({});pendingEffects.forEach(effect=>effect()); return tree; }
  return { source, calls, render, tree: () => tree };
}
function all(node, type) {
  const result = [];
  const visit = item => { if (!item || typeof item !== 'object') return; if (item.type === type) result.push(item); if (Array.isArray(item)) item.forEach(visit); else if (item.props) Object.values(item.props).forEach(visit); };
  visit(node); return result;
}
const press = (tree, label) => { const button = all(tree, 'Button').find(value => value.props.label === label); assert.ok(button, label); return button.props.onPress(); };

test('Friends accepts a real incoming row with its reviewed generation and shows queued status before any server ACK', async () => {
  const f = fixture(); let tree = f.render();
  all(tree, 'Segments')[0].props.onChange('requests'); tree = f.render();
  const list = all(tree, 'FlatList')[0], row = list.props.renderItem({ item: friend });
  await press(row, 'm5a.accept'); await Promise.resolve(); await Promise.resolve(); tree = f.render();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].expected_generation, 4);
  assert.equal(f.calls[0].verb, 'accept');
  assert.ok(all(tree, 'Note').some(value => value.props.children === 'm5a.pendingQueued'));
  assert.ok(!all(tree, 'Note').some(value => value.props.children === 'm5a.applied'));
});

test('an old incoming-request press cannot accept a replacement friendship generation', async () => {
  const f = fixture(); let tree = f.render();
  all(tree, 'Segments')[0].props.onChange('requests'); tree = f.render();
  const row = all(tree, 'FlatList')[0].props.renderItem({ item: friend });
  f.source.social = { ...f.source.social, friends: [{ ...friend, generation: 5 }] }; f.render();
  await press(row, 'm5a.accept');
  assert.equal(f.calls.length, 0);
});

test('a movement lock appearing after a row was rendered blocks its action and list scrolling', async () => {
  const f = fixture(); let tree = f.render();
  all(tree, 'Segments')[0].props.onChange('requests'); tree = f.render();
  const row = all(tree, 'FlatList')[0].props.renderItem({ item: friend });
  f.source.moving = true; tree = f.render(); await press(row, 'm5a.accept');
  assert.equal(f.calls.length, 0);
  assert.equal(all(tree, 'FlatList')[0].props.scrollEnabled, false);
});
test('blocked first-page retry invokes its owner-only loader and a definitive rejection does not claim pending',async()=>{
 const f=fixture();let loads=0,refreshes=0;f.source.social.loadMoreBlocked=async()=>{loads++;};f.source.social.refresh=async()=>{refreshes++;};
 let tree=f.render();all(tree,'Segments')[0].props.onChange('blocked');f.source.social={...f.source.social,pages:{...f.source.social.pages,blocked:{loading:false,error:'SOCIAL_UNAVAILABLE',hasMore:false}}};tree=f.render();
 await press(tree,'m5a.refresh');assert.equal(loads,2);assert.equal(refreshes,0);
 const g=fixture();tree=g.render();all(tree,'Segments')[0].props.onChange('requests');tree=g.render();const row=all(tree,'FlatList')[0].props.renderItem({item:friend});await press(row,'m5a.accept');
 g.source.social.latest={operationId:'00000000-0000-4000-8000-000000000002',status:'rejected',error:'FRIEND_CHANGED'};tree=g.render();
 assert.ok(all(tree,'Note').some(value=>value.props.children==='FRIEND_CHANGED'&&value.props.error));assert.equal(all(tree,'Note').some(value=>value.props.children==='m5a.pendingQueued'),false);
});
test('unknown-response recovery remains available when reads are fresh despite a coordinator transport error',async()=>{
 const f=fixture();f.source.social.error='SOCIAL_UNAVAILABLE';let tree=f.render();all(tree,'Segments')[0].props.onChange('requests');tree=f.render();const row=all(tree,'FlatList')[0].props.renderItem({item:friend});assert.equal(all(row,'Button').find(value=>value.props.label==='m5a.accept').props.disabled,false);
 f.source.social={...f.source.social,fresh:false};tree=f.render();assert.equal(all(all(tree,'FlatList')[0].props.renderItem({item:friend}),'Button').find(value=>value.props.label==='m5a.accept').props.disabled,true);
});

const invitation={id:'00000000-0000-4000-8000-000000000020',creator_id:friend.user_id,creator_name:'Rider One',route_summary:{title:'Shared route',category:'scooter',revision:3},route_snapshot:{route_id:'00000000-0000-4000-8000-000000000030',title:'Shared route',category:'scooter',revision:3,segments:[],geometryStatus:'hidden',privacyTrimMeters:200,geometryHash:null,provider:'draft',attribution:null},mode:'group_ride',metric:'none',course_session_id:null,starts_at:'2030-10-01T12:00:00Z',ends_at:'2030-10-01T15:00:00Z',state:'open',created_at:'2026-10-01T12:00:00Z',member:{state:'invited',friendship_generation:4},can_cancel:false};
test('Invitations accepts only the reviewed safe snapshot and exact member generation, with no optimistic confirmation',async()=>{
 const f=fixture('InvitationsScreen');f.source.social.invitations=[invitation];let tree=f.render();const row=all(tree,'FlatList')[0].props.renderItem({item:invitation});
 await press(row,'m5a.viewRoute');tree=f.render();await press(tree,'m5a.accept');tree=f.render();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].expected_member_state,'invited');assert.equal(f.calls[0].friendship_generation,4);assert.ok(all(tree,'Note').some(value=>value.props.children==='m5a.pendingQueued'));
});
test('historical invitation cannot be accepted, and an old review cannot act on a replacement generation',async()=>{
 const f=fixture('InvitationsScreen');const historical={...invitation,route_snapshot:null};f.source.social.invitations=[historical];let tree=f.render();let row=all(tree,'FlatList')[0].props.renderItem({item:historical});
 assert.equal(all(row,'Button').some(value=>value.props.label==='m5a.accept'),false);await press(row,'m5a.decline');assert.equal(f.calls[0].verb,'decline');
 const g=fixture('InvitationsScreen');g.source.social.invitations=[invitation];tree=g.render();row=all(tree,'FlatList')[0].props.renderItem({item:invitation});await press(row,'m5a.viewRoute');tree=g.render();const accept=all(tree,'Button').find(value=>value.props.label==='m5a.accept');assert.ok(accept);
 g.source.social={...g.source.social,invitations:[{...invitation,member:{state:'invited',friendship_generation:5}}]};g.render();await accept.props.onPress();assert.equal(g.calls.length,0);
});
test('create sends one atomic frozen invitation only after route/friend review and preserves hidden geometry proof',async()=>{
 const f=fixture('InvitationsScreen');f.source.social.friends=[{...friend,state:'accepted'}];f.source.choices.routes=[{id:'00000000-0000-4000-8000-000000000030',owner_id:'00000000-0000-4000-8000-000000000003',title:'A real saved route',revision:3,category:'scooter',approved_course_id:null,approved_revision:null}];
 let tree=f.render();await press(tree,'m5a.create');await Promise.resolve();await Promise.resolve();tree=f.render();
 await press(tree,'A real saved route');await press(tree,'Rider One · @rider_one');tree=f.render();const field=all(tree,'Field').find(value=>value.props.label==='m5a.startTime');assert.ok(field);field.props.onChangeText('2030-10-01 12:00');tree=f.render();
 await press(tree,'m5a.review');tree=f.render();assert.equal(f.calls.length,0);assert.equal(f.source.reviews.length,1);await press(tree,'m5a.sendInvite');tree=f.render();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'create_invitation');assert.equal(f.calls[0].route_revision,3);assert.equal(f.calls[0].friendship_generation,4);assert.equal(f.calls[0].reviewed_geometry_hash,null);assert.equal(f.calls[0].session_id,null);assert.equal(Object.hasOwn(f.calls[0],'segments'),false);assert.ok(all(tree,'Note').some(value=>value.props.children==='m5a.pendingQueued'));
});
test('an interrupted choice read cannot adopt after blur and leaves a usable refresh instead of an endless spinner',async()=>{
 const f=fixture('InvitationsScreen');let resolve;const held=new Promise(done=>{resolve=done;});f.source.getChoices=()=>held;let tree=f.render();await press(tree,'m5a.create');tree=f.render();assert.ok(all(tree,'ActivityIndicator').length);
 f.source.focused=false;f.render();resolve({routes:[],courses:[],sessions:[]});await Promise.resolve();await Promise.resolve();f.source.focused=true;tree=f.render();
 assert.equal(all(tree,'ActivityIndicator').length,0);assert.ok(all(tree,'Button').some(value=>value.props.label==='m5a.refresh'&&!value.props.disabled));assert.equal(f.calls.length,0);
});
test('real social screen JSX does not put whitespace or another raw text node inside native Views',()=>{
 for(const component of ['FriendsScreen','InvitationsScreen']){const f=fixture(component),tree=f.render();for(const node of all(tree,'View')){const children=[node.props.children].flat(Infinity);assert.equal(children.some(value=>typeof value==='string'||typeof value==='number'),false,`${component} View child`);}}
});
test('an older owner route can be loaded and selected from the invitation editor rather than silently omitted',async()=>{
 const f=fixture('InvitationsScreen');f.source.social.friends=[{...friend,state:'accepted'}];const makeRoute=n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner_id:'00000000-0000-4000-8000-000000000003',title:`Route ${n}`,revision:3,category:'scooter',approved_course_id:null,approved_revision:null,updated_at:'2026-10-01T02:00:00.123456+00:00'});
 f.source.choices={routes:Array.from({length:30},(_,index)=>makeRoute(index+1)),courses:[],sessions:[],routeCursor:{id:makeRoute(30).id,updated_at:makeRoute(30).updated_at}};f.source.nextRoutes={routes:[makeRoute(31)],nextCursor:null};
 let tree=f.render();await press(tree,'m5a.create');await Promise.resolve();await Promise.resolve();tree=f.render();assert.equal(all(tree,'Button').some(value=>value.props.label==='Route 31'),false);
 await press(tree,'m5a.loadMoreRoutes');tree=f.render();await press(tree,'Route 31');await press(tree,'Rider One · @rider_one');tree=f.render();all(tree,'Field').find(value=>value.props.label==='m5a.startTime').props.onChangeText('2030-10-01 12:00');tree=f.render();await press(tree,'m5a.review');assert.equal(f.source.reviews[0].route.id,makeRoute(31).id);
});
test('review and cancel discard an older held route page and release its spinner for a deliberate retry',async()=>{
 const f=fixture('InvitationsScreen');f.source.social.friends=[{...friend,state:'accepted'}];const route={id:'00000000-0000-4000-8000-000000000030',owner_id:'00000000-0000-4000-8000-000000000003',title:'Selected route',revision:3,category:'scooter',approved_course_id:null,approved_revision:null,updated_at:'2026-10-01T02:00:00.123456+00:00'},older={...route,id:'00000000-0000-4000-8000-000000000031',title:'Older route'};
 f.source.choices={routes:[route],courses:[],sessions:[],routeCursor:{id:route.id,updated_at:route.updated_at}};let resolvePage;f.source.nextRoutes=new Promise(done=>{resolvePage=done;});
 let tree=f.render();await press(tree,'m5a.create');await Promise.resolve();await Promise.resolve();tree=f.render();await press(tree,route.title);await press(tree,'Rider One · @rider_one');tree=f.render();all(tree,'Field').find(value=>value.props.label==='m5a.startTime').props.onChangeText('2030-10-01 12:00');tree=f.render();
 const oldPage=press(tree,'m5a.loadMoreRoutes');tree=f.render();assert.equal(all(tree,'Button').find(node=>node.props.label==='m5a.loadMoreRoutes').props.busy,true);await press(tree,'m5a.review');tree=f.render();assert.ok(all(tree,'Button').some(node=>node.props.label==='m5a.sendInvite'));await press(tree,'m5a.cancel');resolvePage({routes:[older],nextCursor:null});await oldPage;tree=f.render();
 const more=all(tree,'Button').find(node=>node.props.label==='m5a.loadMoreRoutes');assert.ok(more);assert.equal(more.props.disabled,false);assert.equal(more.props.busy,false);assert.equal(all(tree,'Button').some(node=>node.props.label===older.title),false,'invalidated page must not enter the editor');assert.equal(f.calls.length,0);
 f.source.nextRoutes={routes:[older],nextCursor:null};await more.props.onPress();tree=f.render();assert.ok(all(tree,'Button').some(node=>node.props.label===older.title));
});
test('a failed or stale empty social page never asserts no friends/invitations and keeps error recovery available',()=>{
 for(const component of ['FriendsScreen','InvitationsScreen']){
  const f=fixture(component),bucket=component==='FriendsScreen'?'friends':'invitations';f.source.social.friends=[];f.source.social.pages[bucket].error='SOCIAL_UNAVAILABLE';
  let tree=f.render();assert.equal(all(tree,'Empty').length,0,`${component} failed page`);assert.ok(all(tree,'Note').some(node=>node.props.error&&node.props.children==='SOCIAL_UNAVAILABLE'));assert.ok(all(tree,'Button').some(node=>node.props.label==='m5a.refresh'));assert.equal(all(tree,'SocialPending').length,1);
  f.source.social={...f.source.social,fresh:false,pages:{...f.source.social.pages,[bucket]:{loading:false,error:null,hasMore:false}}};tree=f.render();assert.equal(all(tree,'Empty').length,0,`${component} stale page`);assert.equal(all(tree,'SocialPending').length,1);
  f.source.social={...f.source.social,fresh:true};tree=f.render();assert.equal(all(tree,'Empty').length,1,`${component} confirmed successful empty page`);
 }
});
test('a first blocked-page failure cannot claim there are no blocked accounts',()=>{
 const f=fixture();let tree=f.render();all(tree,'Segments')[0].props.onChange('blocked');f.source.social.pages.blocked={loading:false,error:'SOCIAL_UNAVAILABLE',hasMore:false};tree=f.render();assert.equal(all(tree,'Empty').length,0);assert.ok(all(tree,'Note').some(node=>node.props.error&&node.props.children==='SOCIAL_UNAVAILABLE'));assert.ok(all(tree,'Button').some(node=>node.props.label==='m5a.refresh'));
});
