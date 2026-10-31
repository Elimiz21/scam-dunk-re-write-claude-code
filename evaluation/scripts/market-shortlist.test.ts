import {shouldFilterBySize} from './market-shortlist';
test.each(['ALERT','BEHAVIORAL'])('large size and liquidity cannot suppress an independent %s warning',category=>{
 const large={marketCap:5e11,avgDollarVolume:1e9,signals:[{category,code:'INDEPENDENT_WARNING'}]};
 expect(shouldFilterBySize(large)).toEqual({filtered:false,reason:null});
 expect(shouldFilterBySize({...large,signals:[{category:'PATTERN',code:'VOLUME_SPIKE'}]}).filtered).toBe(true);
});
test('applies dollar liquidity consistently to listed and retained post-scan field names',()=>{
 expect(shouldFilterBySize({marketCap:1e8,avgDollarVolume30d:2e7})).toEqual(shouldFilterBySize({marketCap:1e8,avgDollarVolume:2e7}));
 expect(shouldFilterBySize({marketCap:1e8,avgDollarVolume:5e6}).filtered).toBe(false);
});
