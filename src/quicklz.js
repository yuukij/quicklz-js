import React from 'react'


/**
	Modified version of https://github.com/tarelli/quicklz-js
**/
class QuickLZ{

	constructor(){
		// Streaming mode not supported
		this.QLZ_STREAMING_BUFFER = 0;

		this.QLZ_MEMORY_SAFE = 0;

		this.QLZ_VERSION_MAJOR = 1;
		this.QLZ_VERSION_MINOR = 5;
		this.QLZ_VERSION_REVISION = 0;

		// Decrease QLZ_POINTERS_3 to increase compression speed of level 3. Do not
		// edit any other constants!
		this.HASH_VALUES = 4096;
		this.MINOFFSET = 2;
		this.UNCONDITIONAL_MATCHLEN = 6;
		this.UNCOMPRESSED_END = 4;
		this.CWORD_LEN = 4;
		this.DEFAULT_HEADERLEN = 9;
		this.QLZ_POINTERS_1 = 1;
		this.QLZ_POINTERS_3 = 16;
	}



	headerLen = function(source)
	{
		return ((source[0] & 2) == 2) ? 9 : 3;
	};


	sizeDecompressed = function(source)
	{
		if (this.headerLen(source) == 9)
			return this.fast_read(source, 5, 4);
		else
			return this.fast_read(source, 2, 1);
	};

	sizeCompressed = function(source)
	{
		if (this.headerLen(source) == 9)
			return this.fast_read(source, 1, 4);
		else
			return this.fast_read(source, 1, 1);
	};


	arraycopy = function (aSource, aSourceOffset = 0,  aTarget, aTargetOffset = 0, aLength = aSource.byteLength) {
	  // The rest just gets the data copied into it.
	  let view = new Uint8Array(aTarget, aTargetOffset);
	  view.set(new Uint8Array(aSource, aSourceOffset, aLength));
	}

	fast_read = (a, i, numbytes) =>
	{
		var l = 0;
		for (let j = 0; j < numbytes; j++)
			l |= (((a[i + j]) & 0xff) << j * 8);
		return l;
	}

	decompress(source, level)
	{
		var size = this.sizeDecompressed(source);
		var src = this.headerLen(source);
		var dst = 0;
		var cword_val = 1;
		var destination = new Uint8Array(size);
		var hashtable = new Int32Array(4096);
		var hash_counter = new Uint8Array(4096);
		var last_matchstart = size - this.UNCONDITIONAL_MATCHLEN - this.UNCOMPRESSED_END - 1;
		var last_hashed = -1;
		var hash;
		var fetch = 0;

		if(!level){
			var lvl = (source[0] >>> 2) & 0x3;
			if (lvl != 1 && lvl != 3){
				throw new Error("Javascript version only supports level 1 and 3");
			}
			level = lvl;
			//level = 1;//don't ask. it works ¯\_(ツ)_/¯

		}

		if ((source[0] & 1) != 1)
		{
			var d2 = new Uint8Array(size);
			this.arraycopy(source, this.headerLen(source), d2, 0, size);
			return d2;
		}

		for (;;)
		{
			if (cword_val == 1)
			{
				cword_val = this.fast_read(source, src, 4);
				src += 4;
				if (dst <= last_matchstart)
				{
					if(level == 1)
						fetch = this.fast_read(source, src, 3);
					else
						fetch = this.fast_read(source, src, 4);
				}
			}

			if ((cword_val & 1) == 1)
			{
				var matchlen;
				var offset2;

				cword_val = cword_val >>> 1;

				if (level == 1)
				{
					hash = (fetch >>> 4) & 0xfff;
					offset2 = hashtable[hash];

					if ((fetch & 0xf) != 0)
					{
						matchlen = (fetch & 0xf) + 2;
						src += 2;
					}
					else
					{
						matchlen = (Number(source[src + 2])) & 0xff;
						src += 3;
					}
				}
				else
				{
					var offset;

					if ((fetch & 3) == 0)
					{
						offset = (fetch & 0xff) >>> 2;
						matchlen = 3;
						src++;
					}
					else if ((fetch & 2) == 0)
					{
						offset = (fetch & 0xffff) >>> 2;
						matchlen = 3;
						src += 2;
					}
					else if ((fetch & 1) == 0)
					{
						offset = (fetch & 0xffff) >>> 6;
						matchlen = ((fetch >>> 2) & 15) + 3;
						src += 2;
					}
					else if ((fetch & 127) != 3)
					{
						offset = (fetch >>> 7) & 0x1ffff;
						matchlen = ((fetch >>> 2) & 0x1f) + 2;
						src += 3;
					}
					else
					{
						offset = (fetch >>> 15);
						matchlen = ((fetch >>> 7) & 255) + 3;
						src += 4;
					}
					offset2 = Number(dst - offset);
				}

				destination[dst + 0] = destination[offset2 + 0];
				destination[dst + 1] = destination[offset2 + 1];
				destination[dst + 2] = destination[offset2 + 2];

				for (var i = 3; i < matchlen; i += 1)
				{
					destination[dst + i] = destination[offset2 + i];
				}
				dst += matchlen;

				if (level == 1)
				{
					fetch = this.fast_read(destination, last_hashed + 1, 3); // destination[last_hashed + 1] | (destination[last_hashed + 2] << 8) | (destination[last_hashed + 3] << 16);
					while (last_hashed < dst - matchlen)
					{
						last_hashed++;
						hash = ((fetch >>> 12) ^ fetch) & (this.HASH_VALUES - 1);
						hashtable[hash] = last_hashed;
						hash_counter[hash] = 1;
						fetch = fetch >>> 8 & 0xffff | ((Number(destination[last_hashed + 3])) & 0xff) << 16;
					}
					fetch = this.fast_read(source, src, 3);
				}
				else
				{
					fetch = this.fast_read(source, src, 4);
				}
				last_hashed = dst - 1;
			}
			else
			{
				if (dst <= last_matchstart)
				{
					destination[dst] = source[src];
					dst += 1;
					src += 1;
					cword_val = cword_val >>> 1;

					if (level == 1)
					{
						while (last_hashed < dst - 3)
						{
							last_hashed++;
							let fetch2 = this.fast_read(destination, last_hashed, 3);
							hash = ((fetch2 >>> 12) ^ fetch2) & (this.HASH_VALUES - 1);
							hashtable[hash] = last_hashed;
							hash_counter[hash] = 1;
						}
						fetch = fetch >> 8 & 0xffff | ((Number(source[src + 2])) & 0xff) << 16;
					}
					else
					{
						fetch = fetch >> 8 & 0xffff | ((Number(source[src + 2])) & 0xff) << 16 | ((Number(source[src + 3])) & 0xff) << 24;
					}
				}
				else
				{
					while (dst <= size - 1)
					{
						if (cword_val == 1)
						{
							src += this.CWORD_LEN;
							cword_val = 0x80000000;
						}

						destination[dst] = source[src];
						dst++;
						src++;
						cword_val = cword_val >>> 1;
					}
					return destination;
				}
			}
		}
	}
}
export default QuickLZ;
