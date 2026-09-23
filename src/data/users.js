let users = [];
let transactions = [];
let idCounter = 1;

module.exports = {users, transactions, getNextId: () => idCounter++}