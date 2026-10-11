import test from 'node:test';
import assert from 'node:assert/strict';
import { sites } from '../build/sites-vite-plugin';
function middleware(autoLocalSignIn=true){
 let handle:(req:unknown,res:unknown,next:()=>void)=>void=()=>{};
 const plugin=sites({autoLocalSignIn}) as unknown as {configureServer(server:unknown):void};
 plugin.configureServer({config:{server:{},logger:{info(){}}},middlewares:{use(fn:typeof handle){handle=fn;}}});
 return (options:{host?:string;remote?:string;cookie?:string;path?:string;spoof?:boolean}={})=>{
  const request={headers:{host:options.host||'localhost:5173',...(options.cookie?{cookie:options.cookie}:{}),...(options.spoof?{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@test.invalid'}:{})} as Record<string,string>,rawHeaders:[] as string[],url:options.path||'/api/papers',method:'GET',socket:{remoteAddress:options.remote||'::1'}};
  const response={statusCode:200,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},end(){}};let next=false;handle(request,response,()=>{next=true;});return {request,response,next};
 };
}
test('本地无Cookie自动身份；客户端伪造身份先删除再由中间件赋值',()=>{for(const spoof of [false,true]){const r=middleware()({spoof});assert.equal(r.request.headers['oai-authenticated-user-id'],'local_seedy');assert.equal(r.request.headers['oai-authenticated-user-email'],'seedy@sites.test');assert.equal(r.next,true);}});
test('非本地主机或非loopback连接不获得自动身份',()=>{for(const options of [{host:'example.test:5173'},{remote:'192.168.1.3'}]){const r=middleware()({...options,spoof:true});assert.equal(r.request.headers['oai-authenticated-user-id'],undefined);}});
test('显式退出保持退出，显式登录恢复；重复标记不授予身份',()=>{const handle=middleware();const out=handle({path:'/signout-with-chatgpt'});assert.match(out.response.headers['Set-Cookie'],/__sites_local_auth=0;/);assert.equal(handle({cookie:'__sites_local_auth=0'}).request.headers['oai-authenticated-user-id'],undefined);assert.match(handle({path:'/signin-with-chatgpt'}).response.headers['Set-Cookie'],/__sites_local_auth=1;/);assert.equal(handle({cookie:'__sites_local_auth=1'}).request.headers['oai-authenticated-user-id'],'local_seedy');assert.equal(handle({cookie:'__sites_local_auth=1; __sites_local_auth=1'}).request.headers['oai-authenticated-user-id'],undefined);});
test('默认插件保留原来的手动登录行为',()=>{assert.equal(middleware(false)().request.headers['oai-authenticated-user-id'],undefined);});
