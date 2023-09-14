const me: { rating: number, RD: number } = { rating: 1600, RD: 100 };
const other: { rating: number, RD: number } = { rating: 1500, RD: 100 };



function g(RD: number): number {
	const q = 0.0057565;
	return 1 / Math.sqrt(1 + ((3 * (q ** 2) * (RD ** 2)) / (Math.PI ** 2)));
}

function E(myRating: number, other: { rating: number, RD: number }): number {
	const exponent = -1 * g(other.RD) * (myRating - other.rating) / 400;
	return (1 / (1 + Math.pow(10, exponent)));
}

function dSquare(myRating: number, other: { rating: number, RD: number }): number {
	const Evalue = E(myRating, other);
	const q = 0.0057565;
	return 1 / ((q ** 2) * (g(other.RD) ** 2) * Evalue * (1 - Evalue));
}

function glicko(me: { rating: number, RD: number }, other: { rating: number, RD: number }, result: number): number {
	const q = 0.0057565;
	if (result !== 1 && result !== 0 && result !== 1 / 2) {
		// error	
	}
	console.log("win or lose", E(me.rating, other));
	return me.rating + (q / ((1 / (me.RD ** 2)) + (1 / dSquare(me.rating, other)))) * (g(me.RD) * (result - E(me.rating, other)));
}


console.log(glicko(me, other, 1));
console.log(glicko(me, other, 0));
console.log(glicko(me, other, 1 / 2));