let users = [
    {name: "Freedom", email: "editorfreedom01@gmail.com", password: "Freedom@123", role: "admin"}
];
let transactions = [];
let idCounter = 1;

module.exports = {users, transactions, getNextId: () => idCounter++}