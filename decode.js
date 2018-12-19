export const deckDecoder = (() => {

    const currentVersion = 2
    const encodedPrefix = 'ADC'

    /**
     * @param {*} codeString 
     */
    const parseDeck = (codeString) => {

        let deckBytes = decodeDeckString(codeString)
        if (!deckBytes) return false;

        let deck = parseDeckInternal(codeString, deckBytes)
        return deck

    }

    /**
     * @param {*} codeString 
     */
    const decodeDeckString = (codeString) => {

        if (codeString.substring(0, encodedPrefix.length) != encodedPrefix) return false

        let noPrefix = codeString.substring(encodedPrefix.length);
        noPrefix = noPrefix.replace(/-/g, '/')
        noPrefix = noPrefix.replace(/_/g, '=')

        let decoded = window.atob(noPrefix);

        let deckBytes = []

        for (var i = 0; i < decoded.length; i++) {
            deckBytes.push(decoded.charCodeAt(i))
        }

        return deckBytes

    }

    /**
     * @param {*} nChunk 
     * @param {*} nNumBits 
     * @param {*} nCurrShift 
     * @param {*} nOutBits 
     */
    const readBitsChunk = (nChunk, nNumBits, nCurrShift, nOutBits) => {

        let nContinueBit = (1 << nNumBits)
        let nNewBits = nChunk & (nContinueBit - 1)
        nOutBits[0] |= (nNewBits << nCurrShift)

        return (nChunk & nContinueBit) != 0

    }

    /**
     * @param {*} nBaseValue 
     * @param {*} nBaseBits 
     * @param {*} _data 
     * @param {*} indexStart 
     * @param {*} indexEnd 
     * @param {*} outValue 
     */
    const readVarEncodedUint32 = (nBaseValue, nBaseBits, _data, indexStart, indexEnd, outValue) => {

        outValue[0] = 0
        let nDeltaShift = 0

        if ((nBaseBits == 0) || readBitsChunk(nBaseValue, nBaseBits, nDeltaShift, outValue)) {

            nDeltaShift += nBaseBits

            while (true) {
                
                if (indexStart[0] > indexEnd) return false
                let nNextByte = _data[indexStart[0]++]
                if (!readBitsChunk(nNextByte, 7, nDeltaShift, outValue)) break
                nDeltaShift += 7

            }
        }

        return true

    }

    /**
     * @param {*} _data 
     * @param {*} indexStart 
     * @param {*} indexEnd 
     * @param {*} nPrevCardBase 
     * @param {*} nOutCount 
     * @param {*} nOutCardId 
     */
    const readSerializedCard = (_data, indexStart, indexEnd, nPrevCardBase, nOutCount, nOutCardId) => {

        if (indexStart[0] > indexEnd) return false

        let nHeader = _data[indexStart[0]++]
        let bHasExtendedCount = ((nHeader >> 6) == 0x03)
        let nCardDelta = [0]

        if (!readVarEncodedUint32(nHeader, 5, _data, indexStart, indexEnd, nCardDelta)) return false

        nOutCardId[0] = nPrevCardBase[0] + nCardDelta[0]

        if (bHasExtendedCount) {
            if (!readVarEncodedUint32(0, 0, _data, indexStart, indexEnd, nOutCount)) return false
        }
        else {
            nOutCount[0] = (nHeader >> 6) + 1
        }

        nPrevCardBase[0] = nOutCardId[0]

        return true

    }

    /**
     * @param {*} codeString 
     * @param {*} deckBytes 
     */
    const parseDeckInternal = (codeString, deckBytes) => {
        
        let nCurrentByteIndex = [0]
        let nTotalBytes = deckBytes.length
        let nVersionAndHeroes = deckBytes[nCurrentByteIndex[0]++]
        let version = nVersionAndHeroes >> 4

        if (currentVersion != version && version != 1) return false

        let nChecksum = deckBytes[nCurrentByteIndex[0]++]
        let nStringLength = 0

        if (version > 1) nStringLength = deckBytes[nCurrentByteIndex[0]++]

        let nTotalCardBytes = nTotalBytes - nStringLength
        let nComputedChecksum = 0

        for (let i = nCurrentByteIndex[0]; i < nTotalCardBytes; i++) {
            nComputedChecksum += deckBytes[i]
        }

        let masked = (nComputedChecksum & 0xFF)

        if (nChecksum != masked) return false

        let nNumHeroes = [0]

        if (!readVarEncodedUint32(nVersionAndHeroes, 3, deckBytes, nCurrentByteIndex, nTotalCardBytes, nNumHeroes)) return false

        let heroes = []
        let nPrevCardBase = [0]

        for (let nCurrHero = 0; nCurrHero < nNumHeroes[0]; nCurrHero++) {

            let nHeroTurn = [0]
            let nHeroCardId = [0]

            if (!readSerializedCard(deckBytes, nCurrentByteIndex, nTotalCardBytes, nPrevCardBase, nHeroTurn, nHeroCardId)) return false

            heroes.push({'id': nHeroCardId[0], 'turn': nHeroTurn[0]})

        }

        let cards = []
        nPrevCardBase [0] = 0

        while (nCurrentByteIndex[0] <= nTotalCardBytes) {

            let nCardCount = [0]
            let nCardId = [0]

            if (!readSerializedCard(deckBytes, nCurrentByteIndex, nTotalBytes, nPrevCardBase, nCardCount, nCardId)) return false

            cards.push({'id': nCardId[0], 'count': nCardCount[0]})

        }

        let name = ''
        
        if (nCurrentByteIndex[0] <= nTotalBytes) {
            let bytes = deckBytes.slice(-1 * nStringLength)
            name = bytes
        }

        return {'heroes': heroes, 'cards': cards, 'name': name}

    }

    return {parseDeck, decodeDeckString}

})();