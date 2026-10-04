import { expect, test } from 'vitest';
import { interpretPrimarySources } from '../../server/discovery/primarySources';
import { selectProposals } from '../../shared/discoveryPolicy';
import { bundle, edition, request } from './fixtures';
import type { Source } from '../../shared/discovery';
const req = request({ target: { title:'Ascension',author:'RinoZ',series:'Book of the Dead',position:5,orderNote:'' } });
const catalog = bundle([edition({title:'Ascension',author:'RinoZ',position:5,date:null,precision:'none',market:null})]);
const text='Book of the Dead 5: Ascension\nBook of the Dead Book 5\nBy RinoZ\nBuy The Book\nThe Complete Series\nOther Book\nBook Details\nPrice Ebook\n6.99\nPublication Date\nJuly 22, 2026\nAethon Books icon';
const publisher: Source={id:'publisher',title:'Book of the Dead 5: Ascension',url:'https://aethonbooks.com/book/book-of-the-dead-5',provider:'tavily',market:null,retrievedAt:'2026-10-04T00:00:00Z',text};
const evidence=()=>({...catalog,sources:[...catalog.sources,{...publisher}]});
test('publisher product date and format combine with matching English catalog evidence',()=>{
 const found=interpretPrimarySources(req,evidence());
 expect(selectProposals(req,found,'2026-10-04T00:00:00Z').releases.book).toMatchObject({date:'2026-07-22',provenance:{sourceMarket:null,editionFormat:'ebook'}});
 expect(found.editions.filter(e=>e.id.startsWith('publisher:'))).toHaveLength(1);
});
test.each(['wrong volume','wrong author','wrong host','invalid day','multiple dates','recommendation date','unknown language','no format'])('publisher date rejects %s',mode=>{
 const e=evidence();const s=e.sources[1];
 if(mode==='wrong volume')s.text=s.text.replace('Book of the Dead Book 5','Book of the Dead Book 4');
 if(mode==='wrong author')s.text=s.text.replace('By RinoZ','By Someone Else');
 if(mode==='wrong host')s.url='https://unrelated.example/book';
 if(mode==='invalid day')s.text=s.text.replace('July 22','February 30');
 if(mode==='multiple dates')s.text=s.text.replace('Aethon Books icon','Publication Date\nAugust 22, 2026\nAethon Books icon');
 if(mode==='recommendation date')s.text=s.text.replace('Book Details\n','').replace('Aethon Books icon','Book Details\nAethon Books icon');
 if(mode==='unknown language')e.editions=e.editions.map(item=>({...item,language:null}));
 if(mode==='no format')s.text=s.text.replace('Price Ebook\n6.99','');
 expect(interpretPrimarySources(req,e).editions.filter(item=>item.id.startsWith('publisher:'))).toHaveLength(0);
});
